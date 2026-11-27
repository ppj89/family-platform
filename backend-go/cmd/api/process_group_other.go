//go:build !unix

package main

import "os/exec"

// killProcessGroupOnCancel is a no-op off Unix; the API only runs on Linux.
func killProcessGroupOnCancel(command *exec.Cmd) {}
