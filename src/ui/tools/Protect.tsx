import { useState } from 'react'
import {
  caveat,
  describeSecurity,
  protectPdf,
  unlockPdf,
  type ChangesLevel,
  type PrintingLevel,
  type Security,
} from '../../core/pdf-security.ts'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import { Button, Field, LockIcon, PlusIcon, Segmented, Select, TextInput } from '../kit.tsx'
import { useT } from '../i18n.ts'
import { message, readBytes, save, stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

interface Loaded {
  name: string
  bytes: Uint8Array
  security: Security
}

export function Protect() {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [openPassword, setOpenPassword] = useState('')
  const [permissionsPassword, setPermissionsPassword] = useState('')
  const [password, setPassword] = useState('')
  const [printing, setPrinting] = useState<PrintingLevel>('high')
  const [changes, setChanges] = useState<ChangesLevel>('any')
  const [copying, setCopying] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Passwords live only in this component's state; nothing is ever persisted. */
  function forget() {
    setOpenPassword('')
    setPermissionsPassword('')
    setPassword('')
  }

  function clear() {
    setLoaded(null)
    setError(null)
    forget()
  }

  async function open(files: File[]) {
    const file = files[0]
    if (!file) return
    clear()
    setBusy(true)
    try {
      const bytes = await readBytes(file)
      setLoaded({ name: file.name, bytes, security: await describeSecurity(bytes) })
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  async function run(work: () => Promise<Uint8Array>, suffix: string) {
    if (!loaded) return
    setBusy(true)
    setError(null)
    try {
      const pdf = await work()
      save(toBlob(pdf, 'application/pdf'), `${stem(loaded.name)}-${suffix}.pdf`)
      forget()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  const locked = loaded?.security.needsPassword === true
  const limitation = caveat({ openPassword, printing, changes, copying })

  return (
    <Workspace
      title={t.tools.protect.label}
      accept={ACCEPT}
      onFiles={open}
      error={error}
      empty={
        loaded
          ? undefined
          : { icon: <LockIcon />, title: t.protect.emptyTitle, hint: t.protect.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={open}>
              <Button>
                <PlusIcon />
                {t.export.open}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">{loaded.name}</span>
            <Spacer />
            <Button variant="ghost" onClick={clear}>
              {t.clear}
            </Button>
          </>
        ) : undefined
      }
    >
      {loaded && (
        <div className="mx-auto flex max-w-[560px] flex-col gap-5 p-5 sm:p-8">
          <p className="bg-fill text-body rounded-card px-3 py-2 leading-relaxed">
            {locked
              ? t.protect.lockedNotice
              : loaded.security.encrypted
                ? t.protect.restrictedNotice
                : t.protect.cipher}
          </p>

          {locked ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption text-muted font-medium tracking-wide uppercase">
                  {t.protect.password}
                </span>
                <TextInput
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <Button
                variant="primary"
                className="self-start"
                disabled={busy || password === ''}
                onClick={() => run(() => unlockPdf(loaded.bytes, password), 'unlocked')}
              >
                {busy ? t.protect.working : t.protect.unlock}
              </Button>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-caption text-muted font-medium tracking-wide uppercase">
                  {t.protect.openPassword}
                </span>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={openPassword}
                  onChange={(event) => setOpenPassword(event.target.value)}
                />
              </label>
              <span className="text-caption text-muted -mt-3.5">{t.protect.openHint}</span>

              <label className="flex flex-col gap-1.5">
                <span className="text-caption text-muted font-medium tracking-wide uppercase">
                  {t.protect.permissionsPassword}
                </span>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={permissionsPassword}
                  onChange={(event) => setPermissionsPassword(event.target.value)}
                />
              </label>
              <span className="text-caption text-muted -mt-3.5">{t.protect.permissionsHint}</span>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Field label={t.protect.printing}>
                  <Segmented
                    label={t.protect.printing}
                    value={printing}
                    onChange={setPrinting}
                    options={[
                      { value: 'none', label: t.protect.printingNone },
                      { value: 'low', label: t.protect.printingLow },
                      { value: 'high', label: t.protect.printingHigh },
                    ]}
                  />
                </Field>
                <Field label={t.protect.changes}>
                  <Select
                    value={changes}
                    onChange={(event) => setChanges(event.target.value as ChangesLevel)}
                  >
                    <option value="none">{t.protect.changesNone}</option>
                    <option value="assembly">{t.protect.changesAssembly}</option>
                    <option value="forms">{t.protect.changesForms}</option>
                    <option value="comments">{t.protect.changesComments}</option>
                    <option value="any">{t.protect.changesAny}</option>
                  </Select>
                </Field>
              </div>

              <label className="text-body flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={copying}
                  onChange={(event) => setCopying(event.target.checked)}
                  className="accent-ink h-4 w-4"
                />
                {t.protect.copying}
              </label>

              {/* What the settings above are actually worth, recomputed as they
                  change. A fixed footnote would be read once and stop meaning
                  anything; this sharpens the moment a restriction is switched on,
                  which is the moment the difference matters. */}
              <p className="text-caption text-muted max-w-[52ch] leading-[1.5]">
                {limitation === 'opensToAnyone'
                  ? t.protect.restrictionsOpenToAnyone
                  : limitation === 'liftableByReader'
                    ? t.protect.restrictionsLiftable
                    : t.protect.restrictionsNote}
              </p>

              <Button
                variant="primary"
                className="self-start"
                disabled={busy || (openPassword === '' && permissionsPassword === '')}
                onClick={() =>
                  run(
                    () =>
                      protectPdf(loaded.bytes, {
                        openPassword: openPassword || undefined,
                        permissionsPassword: permissionsPassword || undefined,
                        printing,
                        changes,
                        copying,
                        currentPassword: loaded.security.encrypted ? '' : undefined,
                      }),
                    'protected',
                  )
                }
              >
                {busy ? t.protect.working : t.protect.lock}
              </Button>
            </>
          )}
        </div>
      )}
    </Workspace>
  )
}
