# TwiTok Safety Engine

Every high-impact user action passes through the safety gateway before publication or completion.

## Flow

USER ACTION
→ SAFETY GATEWAY
→ POLICY ENGINE
→ TEXT / IMAGE / AUDIO / VIDEO ANALYSIS
→ CONTEXT ENGINE
→ RISK CLASSIFIER
→ ALLOW / RESTRICT / BLOCK

## Decision levels

- LOW: allow
- MEDIUM: warn or request edit
- RESTRICTED: allow with limitations
- HIGH: block
- SEVERE: block and apply account safety action

## Covered actions

- video uploads
- captions
- comments
- replies
- hashtags
- usernames
- bios
- profile media
- LIVE
- messages
- community posts
- marketplace listings
- advertisements
- AI-generated content

## Moderation event

```text
event_id
user_id
content_id
action_type
policy_id
risk_level
model_confidence
decision
timestamp
appeal_status
review_status
```

The policy engine, not a generative model, is the final source of enforcement rules.
