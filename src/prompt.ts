import { createInterface } from 'node:readline'

/**
 * Ask for a password without echoing it.
 *
 * A password given on the command line ends up in the shell's history file and,
 * on a shared machine, in anyone's `ps` output. Asking for it is the only way to
 * keep it out of both, so every command that needs one falls back to this.
 */
export function askSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return readPipedLine()

  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })

    // readline has no silent mode; replacing its writer is the long-standing way
    // to stop it echoing what is typed. If a future Node drops that internal,
    // refuse rather than quietly print the password across the terminal.
    const internals = rl as unknown as { _writeToOutput?: (text: string) => void }
    if (typeof internals._writeToOutput !== 'function') {
      rl.close()
      reject(
        new Error(
          'this Node build will not let the password be hidden. Pipe it instead:\n' +
            '  printf \'%s\' "$PASSWORD" | convert.in ...',
        ),
      )
      return
    }
    internals._writeToOutput = () => {}

    process.stdout.write(question)
    rl.question('', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    rl.on('SIGINT', () => {
      rl.close()
      process.stdout.write('\n')
      reject(new Error('cancelled'))
    })
  })
}

/** Piped input, so `printf '%s' "$PW" | convert.in unlock in.pdf` works in scripts. */
function readPipedLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      buffer += chunk
    })
    // Strip every trailing newline, not one: a file saved on Windows, an echo
    // that added a blank line, or a stray carriage return would otherwise ride
    // along inside the password and come back as "that password does not open
    // this PDF", which sends people looking in entirely the wrong place.
    process.stdin.on('end', () => resolve(buffer.replace(/[\r\n]+$/, '')))
    process.stdin.on('error', reject)
  })
}
