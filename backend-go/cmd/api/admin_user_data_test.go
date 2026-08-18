package main

import "testing"

func TestValidAdminUserSearchQuery(t *testing.T) {
	tests := []struct {
		value string
		want  bool
	}{
		{value: "", want: false},
		{value: "   ", want: false},
		{value: "\uc5d4", want: true},
		{value: "a", want: true},
		{value: "1", want: true},
		{value: "12", want: true},
		{value: "  user  ", want: true},
	}

	for _, test := range tests {
		if got := validAdminUserSearchQuery(test.value); got != test.want {
			t.Fatalf("validAdminUserSearchQuery(%q) = %v, want %v", test.value, got, test.want)
		}
	}
}
