/* Intentionally vulnerable: calls "tar" by relative name (no absolute path),
 * so execlp() searches $PATH for it. Installed setuid-root by the Dockerfile,
 * so anyone who prepends a writable directory to $PATH and drops their own
 * "tar" there gets it executed with root privileges — a classic real PATH-
 * hijack privilege escalation. (Deliberately NOT a system()/shell-based
 * command injection: busybox ash — and even bash -p — drop the elevated
 * effective UID as soon as a shell is spawned under euid != ruid, which
 * silently defeats the classic "unsanitized argv passed to system()" pattern
 * on this musl/Alpine base. execlp() with no shell involved has no such
 * protection, so this is the vulnerability that's actually exploitable here.
 * Must also stay a compiled binary, not a #!-script: Linux ignores the
 * setuid bit on interpreted scripts entirely. */
#include <unistd.h>

int main(void) {
    execlp("tar", "tar", "czf", "/tmp/lab-backup.tar.gz", "/home/lab", (char *)NULL);
    return 1;
}
