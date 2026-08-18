package main

import "testing"

func TestCanReadCommunityPostPrivateInquiry(t *testing.T) {
	authorID := int64(11)
	post := communityPostItem{BoardType: "inquiry", IsPrivate: true, AuthorID: &authorID}

	tests := []struct {
		name string
		user authUser
		want bool
	}{
		{name: "author cannot read", user: authUser{ID: authorID}, want: false},
		{name: "platform admin can read", user: authUser{ID: 22, PlatformAdmin: true}, want: true},
		{name: "other user cannot read", user: authUser{ID: 33}, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := canReadCommunityPost(test.user, post); got != test.want {
				t.Fatalf("canReadCommunityPost() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestCanReadCommunityPostPublicBoards(t *testing.T) {
	if !canReadCommunityPost(authUser{ID: 22}, communityPostItem{BoardType: "free", IsPrivate: true}) {
		t.Fatal("non-inquiry posts must remain readable when the private flag is set")
	}
}
