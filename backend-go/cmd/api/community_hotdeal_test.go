package main

import (
	"net/url"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestExtractCommunityHotDealLinksKeepsOnlyAllowedOriginalURLs(t *testing.T) {
	base, err := url.Parse("https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu")
	if err != nil {
		t.Fatal(err)
	}
	source := communityHotDealSource{
		Key: "ppomppu", Label: "뽐뿌",
		allowedPath: func(link *url.URL) bool {
			return link.Host == "www.ppomppu.co.kr" && link.Path == "/zboard/view.php" && link.Query().Get("id") == "ppomppu" && link.Query().Get("no") != ""
		},
	}
	document := `<a href="/zboard/view.php?id=ppomppu&amp;no=123"><strong>삼성카드 특가 34,200원</strong></a>
		<a href="/zboard/view.php?id=ppomppu&amp;no=123">duplicate</a>
		<a href="/zboard/view.php?id=ppomppu&amp;no=123&amp;divpage=71">same article with a list-page parameter</a>
		<a href="https://example.com/post">outside</a>
		<a href="/zboard/view.php?id=ppomppu">missing id</a>`

	items := extractCommunityHotDealLinks(document, base, source, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC))
	if len(items) != 1 {
		t.Fatalf("expected one allowed original URL, got %d: %#v", len(items), items)
	}
	if got, want := items[0].OriginalURL, "https://www.ppomppu.co.kr/zboard/view.php?id=ppomppu&no=123"; got != want {
		t.Fatalf("original URL = %q, want %q", got, want)
	}
	if items[0].SourceLabel != "뽐뿌" {
		t.Fatalf("source label = %q", items[0].SourceLabel)
	}
	if got, want := items[0].Title, "삼성카드 특가 34,200원"; got != want {
		t.Fatalf("title = %q, want %q", got, want)
	}
	if got, want := items[0].Price, "34,200원"; got != want {
		t.Fatalf("price = %q, want %q", got, want)
	}
}

func TestDeduplicateCommunityHotDealItemsRemovesSameSourceAndContent(t *testing.T) {
	items := deduplicateCommunityHotDealItems([]communityHotDealItem{
		{Source: "ppomppu", Title: "same deal", Price: "12,000원", OriginalURL: "https://example.test/a"},
		{Source: "ppomppu", Title: "same deal", Price: "12,000원", OriginalURL: "https://example.test/b"},
		{Source: "ppomppu", Title: "another deal", Price: "12,000원", OriginalURL: "https://example.test/c"},
	})
	if len(items) != 2 {
		t.Fatalf("expected duplicate deal to be removed, got %#v", items)
	}
}

func TestExtractCommunityHotDealLinksFindsPriceBesideTheTitle(t *testing.T) {
	base, err := url.Parse("https://example.test/list")
	if err != nil {
		t.Fatal(err)
	}
	source := communityHotDealSource{
		Key: "example", Label: "Example",
		allowedPath: func(link *url.URL) bool { return link.Host == "example.test" && strings.HasPrefix(link.Path, "/deal/") },
	}
	document := `<article><span>12,345원</span><a href="/deal/1">상품 제목</a></article>`
	items := extractCommunityHotDealLinks(document, base, source, time.Now())
	if len(items) != 1 || items[0].Price != "12,345원" {
		t.Fatalf("nearby list price was not extracted: %#v", items)
	}
}

func TestExtractCommunityHotDealLinksSkipsImageOnlyDuplicateBeforeSubject(t *testing.T) {
	base, err := url.Parse("https://example.test/list")
	if err != nil {
		t.Fatal(err)
	}
	source := communityHotDealSource{
		Key: "example", Label: "Example",
		allowedPath: func(link *url.URL) bool { return link.Host == "example.test" && strings.HasPrefix(link.Path, "/deal/") },
	}
	document := `<a href="/deal/1"><img src="thumbnail.jpg"></a><a href="/deal/1">Flash keyboard 35,000원</a>`
	items := extractCommunityHotDealLinks(document, base, source, time.Now())
	if len(items) != 1 || items[0].Title != "Flash keyboard 35,000원" || items[0].Price != "35,000원" {
		t.Fatalf("subject link after image-only duplicate was not kept: %#v", items)
	}
}

func TestCommunityHotDealCandidateTitleSkipsNoticeAndUsageGuidePosts(t *testing.T) {
	for _, title := range []string{
		"핫딜 게시판 이용안내",
		"공지사항: 거래 규칙",
		"Board guide for new members",
	} {
		if isCommunityHotDealCandidateTitle(title) {
			t.Fatalf("notice title was accepted: %q", title)
		}
	}
	if !isCommunityHotDealCandidateTitle("Wireless keyboard 39,900원") {
		t.Fatal("deal title was incorrectly excluded")
	}
}

func TestCommunityHotDealListingURLsIncludesConfiguredPages(t *testing.T) {
	urls := communityHotDealListingURLs(communityHotDealSource{
		ListingURL:   "https://example.test/list?id=deals",
		ListingPages: 2,
	})
	if len(urls) != 2 {
		t.Fatalf("listing URL count = %d, want 2", len(urls))
	}
	if urls[0] != "https://example.test/list?id=deals" || urls[1] != "https://example.test/list?id=deals&page=2" {
		t.Fatalf("unexpected listing URLs: %#v", urls)
	}
}

func TestPpomppuCollectionCoversRecentListingPages(t *testing.T) {
	for _, source := range communityHotDealSources {
		if source.Key == "ppomppu" {
			if source.ListingPages != 8 || source.MaxItemsPerPage != 30 {
				t.Fatalf("ppomppu collection scope = %d pages x %d items", source.ListingPages, source.MaxItemsPerPage)
			}
			return
		}
	}
	t.Fatal("ppomppu source is missing")
}

func TestCommunityHotDealSearchURLUsesPpomppuSubjectSearch(t *testing.T) {
	searchURL, ok := communityHotDealSearchURL(communityHotDealSources[0], "탄산수")
	if !ok {
		t.Fatal("expected Ppomppu search URL")
	}
	if !strings.Contains(searchURL, "search_type=subject") || !strings.Contains(searchURL, "keyword=%C5%BA%BB%EA%BC%F6") {
		t.Fatalf("unexpected Ppomppu search URL: %s", searchURL)
	}
}

func TestPublicCommunityHotDealSourcesDoNotExposeParserFunctions(t *testing.T) {
	for _, source := range publicCommunityHotDealSources() {
		if source.allowedPath != nil {
			t.Fatalf("source %s exposed internal parser", source.Key)
		}
	}
}

func TestUnpublishedCommunityHotDealsContainNoSourceOrOriginalLinks(t *testing.T) {
	response := unpublishedCommunityHotDeals()
	if response.Published {
		t.Fatal("unpublished response must not be published")
	}
	if len(response.Items) != 0 {
		t.Fatalf("unpublished response exposed %d original links", len(response.Items))
	}
	if len(response.Sources) != 0 {
		t.Fatalf("unpublished response exposed %d sources", len(response.Sources))
	}
}

func TestCommunityHotDealMetadataExtractsDescriptionAndPrice(t *testing.T) {
	document := `<meta property="og:description" content="쿠폰 적용 후 1.5만원, 무료배송입니다.">`
	if got, want := normalizeCommunityHotDealText(communityHotDealMetaContent(document, "og:description"), 180), "쿠폰 적용 후 1.5만원, 무료배송입니다."; got != want {
		t.Fatalf("summary = %q, want %q", got, want)
	}
	if got, want := extractCommunityHotDealPrice("쿠폰 적용 후 1.5만원, 무료배송입니다."), "1.5만원"; got != want {
		t.Fatalf("price = %q, want %q", got, want)
	}
}

func TestCommunityHotDealMetricsExtractCountsAndPublishedDate(t *testing.T) {
	document := `<meta property="article:published_time" content="2026-08-02T13:45:00+09:00"><div>조회 1,234 · 댓글 56</div>`
	views, comments, publishedAt := extractCommunityHotDealMetrics(document, "2026-08-02T00:00:00Z")
	if views != 1234 || comments != 56 {
		t.Fatalf("metrics = views %d, comments %d", views, comments)
	}
	if publishedAt != "2026-08-02T04:45:00Z" {
		t.Fatalf("publishedAt = %q", publishedAt)
	}
	if got, want := communityHotDealPopularityScore(views, comments), int64(2354); got != want {
		t.Fatalf("popularity score = %d, want %d", got, want)
	}
}

func TestCommunityHotDealMetricsFallsBackToCollectionTime(t *testing.T) {
	_, _, publishedAt := extractCommunityHotDealMetrics("<p>조회 없음</p>", "2026-08-02T00:00:00Z")
	if publishedAt != "2026-08-02T00:00:00Z" {
		t.Fatalf("fallback publishedAt = %q", publishedAt)
	}
}

func TestDecodeCommunityHotDealDocumentDecodesLegacyKoreanCharsets(t *testing.T) {
	// EUC-KR bytes for a Korean character. The source must never be passed to
	// the client as malformed UTF-8 even when a feed declares a legacy charset.
	decoded := decodeCommunityHotDealDocument([]byte{0xb0, 0xa1}, "text/html; charset=EUC-KR")
	if !utf8.ValidString(decoded) {
		t.Fatalf("decoded hot-deal document is not valid UTF-8: %q", decoded)
	}
	if decoded == string([]byte{0xb0, 0xa1}) {
		t.Fatal("legacy charset body was not decoded")
	}
}

func TestCommunityHotDealSourcesAcceptOnlyTheirTopListArticlePaths(t *testing.T) {
	cases := []struct {
		key string
		url string
	}{
		{"quasarzone", "https://quasarzone.com/bbs/qb_saleinfo/views/123"},
		{"fmkorea", "https://www.fmkorea.com/hotdeal/123"},
		{"ruliweb", "https://bbs.ruliweb.com/market/board/1020/read/123"},
		{"clien", "https://www.clien.net/service/board/jirum/123"},
		{"coolenjoy", "https://coolenjoy.net/bbs/jirum/123"},
		{"eomisae", "https://eomisae.co.kr/fs/123"},
		{"dealbada", "https://www.dealbada.com/bbs/board.php?bo_table=deal_domestic&wr_id=123"},
		{"damoang", "https://damoang.net/economy/123"},
		{"arca", "https://arca.live/b/hotdeal/123"},
	}
	sources := map[string]communityHotDealSource{}
	for _, source := range communityHotDealSources {
		sources[source.Key] = source
	}
	for _, testCase := range cases {
		source, ok := sources[testCase.key]
		if !ok || !source.CollectionEnabled || source.allowedPath == nil {
			t.Fatalf("source %s is not configured for collection", testCase.key)
		}
		link, err := url.Parse(testCase.url)
		if err != nil || !source.allowedPath(link) {
			t.Fatalf("source %s did not accept %s", testCase.key, testCase.url)
		}
	}
}
