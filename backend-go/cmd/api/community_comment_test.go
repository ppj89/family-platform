package main

import "testing"

func int64Pointer(value int64) *int64 { return &value }

func TestCommunityCommentNotificationRecipient(t *testing.T) {
	tests := []struct {
		name           string
		parentAuthorID *int64
		postAuthorID   *int64
		isReply        bool
		actorID        int64
		want           *int64
	}{
		{name: "comment notifies post author", postAuthorID: int64Pointer(10), actorID: 20, want: int64Pointer(10)},
		{name: "reply notifies parent comment author", parentAuthorID: int64Pointer(30), postAuthorID: int64Pointer(10), isReply: true, actorID: 20, want: int64Pointer(30)},
		{name: "comment does not notify own post", postAuthorID: int64Pointer(20), actorID: 20},
		{name: "reply does not notify own comment", parentAuthorID: int64Pointer(20), isReply: true, actorID: 20},
		{name: "reply without parent author is skipped", isReply: true, actorID: 20},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := communityCommentNotificationRecipient(test.parentAuthorID, test.postAuthorID, test.isReply, test.actorID)
			if got == nil && test.want == nil {
				return
			}
			if got == nil || test.want == nil || *got != *test.want {
				t.Fatalf("recipient = %v, want %v", got, test.want)
			}
		})
	}
}
