//go:build unix

package main

import (
	"os/exec"
	"syscall"
)

// killProcessGroupOnCancel runs the command in its own process group and,
// when its context is cancelled, kills the whole group so helper processes
// the command forked (e.g. BusyBox wget's ssl_client) die with it.
func killProcessGroupOnCancel(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error {
		if command.Process == nil {
			return nil
		}
		return syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
	}
}
