package com.familyplatform.api.community.dto;

import com.familyplatform.api.community.CommunityComment;
import com.familyplatform.api.community.CommunityPost;
import java.util.List;

public record CommunityPostDetail(
    CommunityPost post,
    List<CommunityComment> comments
) {
}
