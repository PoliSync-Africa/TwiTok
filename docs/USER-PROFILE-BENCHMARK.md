# TwiTok User Profiles & Following Benchmark

## TikTok reference
TikTok publicly documents profiles with usernames/nicknames, public/private account choices, following/followers, account types, and account safety controls. Private accounts require approval for followers and who can watch the account's videos. See TikTok Help Center: https://support.tiktok.com/en/getting-started/account-and-profile and https://support.tiktok.com/en/search?searchTerm=account

## TwiTok implementation
- Every user has a unique @username and display nickname.
- Profiles expose public-safe information only.
- Date of birth, email, phone and password hash are never exposed through public profiles.
- Public/private account state is stored server-side.
- Authenticated users can follow/unfollow.
- Follow relationships are unique and indexed for scale.
- Follow counts are computed from the relationship store.
- Authentication is bearer-token based at the API layer and will later support secure device sessions/passkeys.
- Private-account approval is the next required enhancement: the current relationship record marks a private follow as pending, but content visibility and approval workflows must not be treated as complete yet.
