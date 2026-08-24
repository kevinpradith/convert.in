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
import { humanSize } from '../../core/units.ts'
import { FileList, useBatch, type Item } from '../batch.tsx'
import { FilePicker } from '../Dropzone.tsx'
import { Spacer, Workspace } from '../Workspace.tsx'
import {
  Button,
  DownloadIcon,
  Field,
  LockIcon,
  PlusIcon,
  Segmented,
  Select,
  TextInput,
} from '../kit.tsx'
import { useT } from '../i18n.ts'
import { stem, toBlob } from '../files.ts'

const ACCEPT = '.pdf'

export function Protect() {
  const t = useT()
  const batch = useBatch()
  /** What each loaded file already carries, read once as it arrives. */
  const [locks, setLocks] = useState<Record<string, Security>>({})
  const [openPassword, setOpenPassword] = useState('')
  const [permissionsPassword, setPermissionsPassword] = useState('')
  const [password, setPassword] = useState('')
  const [printing, setPrinting] = useState<PrintingLevel>('high')
  const [changes, setChanges] = useState<ChangesLevel>('any')
  const [copying, setCopying] = useState(true)

  /** Passwords live only in this component's state; nothing is ever persisted. */
  function forgetSecrets() {
    setOpenPassword('')
    setPermissionsPassword('')
    setPassword('')
  }

  function clear() {
    batch.clear()
    setLocks({})
    forgetSecrets()
  }

  async function open(files: File[]) {
    const added = await batch.add(files)
    const found: Record<string, Security> = {}
    for (const item of added) {
      try {
        found[item.id] = await describeSecurity(item.bytes)
      } catch {
        // A file that cannot even be inspected is left unmarked; the run itself
        // will say what is wrong with it in words.
      }
    }
    setLocks((previous) => ({ ...previous, ...found }))
  }

  async function run(work: (item: Item) => Promise<Uint8Array>, suffix: string) {
    await batch.run(async (item) => {
      const bytes = await work(item)
      return {
        result: {
          blob: toBlob(bytes, 'application/pdf'),
          name: `${stem(item.name)}-${suffix}.pdf`,
          size: bytes.length,
        },
        note: `${t.batch.done} · ${humanSize(bytes.length)}`,
      }
    }, t.protect.working)
    // The bytes are made by now, so the secrets that made them can go.
    forgetSecrets()
  }

  const loaded = batch.items.length > 0
  const needsPassword = batch.items.filter((item) => locks[item.id]?.needsPassword === true)
  const locked = loaded && needsPassword.length === batch.items.length
  // Locking and unlocking are opposite operations, and a pile holding both
  // cannot be one button.
  const mixed = needsPassword.length > 0 && needsPassword.length < batch.items.length
  const anyRestricted = batch.items.some((item) => locks[item.id]?.encrypted === true)
  const limitation = caveat({ openPassword, printing, changes, copying })

  return (
    <Workspace
      title={t.tools.protect.label}
      accept={ACCEPT}
      onFiles={(files) => void open(files)}
      error={batch.error}
      busy={batch.busy}
      empty={
        loaded
          ? undefined
          : { icon: <LockIcon />, title: t.protect.emptyTitle, hint: t.protect.emptyHint }
      }
      toolbar={
        loaded ? (
          <>
            <FilePicker accept={ACCEPT} onFiles={(files) => void open(files)}>
              <Button>
                <PlusIcon />
                {t.batch.add}
              </Button>
            </FilePicker>
            <span className="text-muted text-body hidden truncate sm:inline">
              {t.batch.count(batch.items.length)}
            </span>
            <Spacer />
            {batch.results.length > 0 && (
              <Button onClick={() => void batch.download()}>
                <DownloadIcon />
                {t.batch.download(batch.results.length)}
              </Button>
            )}
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
            {mixed
              ? t.batch.mixedLocks
              : locked
                ? t.protect.lockedNotice
                : anyRestricted
                  ? t.protect.restrictedNotice
                  : t.protect.cipher}
          </p>

          {!mixed && locked && (
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
                disabled={batch.busy !== null || password === ''}
                onClick={() => void run((item) => unlockPdf(item.bytes, password), 'unlocked')}
              >
                {batch.busy ?? t.protect.unlock}
              </Button>
            </>
          )}

          {!mixed && !locked && (
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
                disabled={
                  batch.busy !== null || (openPassword === '' && permissionsPassword === '')
                }
                onClick={() =>
                  void run(
                    (item) =>
                      protectPdf(item.bytes, {
                        openPassword: openPassword || undefined,
                        permissionsPassword: permissionsPassword || undefined,
                        printing,
                        changes,
                        copying,
                        // A file that is already encrypted has to be opened
                        // before it can be locked again, and one that opens
                        // without a prompt opens with an empty password.
                        currentPassword: locks[item.id]?.encrypted === true ? '' : undefined,
                      }),
                    'protected',
                  )
                }
              >
                {batch.busy ?? t.protect.lock}
              </Button>
            </>
          )}

          <FileList items={batch.items} onRemove={batch.remove} className="" />
        </div>
      )}
    </Workspace>
  )
}
