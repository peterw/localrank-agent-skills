# LocalRank Agent Skills

AI coding agents can now manage your local SEO clients.

This skill lets AI agents (Claude Code, Cursor, Codex, etc.) learn about LocalRank, so they can help you:
- Track local rankings across locations
- Run GMB audits on prospects
- Manage agency clients at scale
- Find quick wins and at-risk clients
- Draft client update emails

## Quick Start

### Install with npx skills

```bash
npx skills add https://github.com/peterw/localrank-agent-skills --skill localrank
```

### Manual Installation

1. Clone this repo
2. Run `./scripts/localrank.js setup`
3. The skill will load automatically in Claude Code

## Setup

Get your API key at [app.localrank.so/settings/api](https://app.localrank.so/settings/api)

```bash
# Interactive setup
./scripts/localrank.js setup

# Or set environment variable
export LOCALRANK_API_KEY=lr_your_key
```

## What You Can Ask

Once installed, ask your AI agent things like:

- "How are my clients doing?"
- "What should I work on today?"
- "Check rankings for Acme Plumbing"
- "Find keywords close to page 1"
- "Which clients might churn?"
- "Run an audit on this Google Maps URL"
- "Draft an update email for Acme"

## Demo

```
> What should I work on today?

[Uses localrank.js prioritize:today]

Urgent:
- Joe's Roofing: Rankings dropped from 6.2 to 12.1

Quick Wins:
- Acme Plumbing: "emergency plumber" is rank 12 - just 2 positions from page 1!
- Smith HVAC: "ac repair near me" is rank 14

Important:
- ABC Landscaping: Average rank 15.3 needs work
```

## Commands

| Command | Description |
|---------|-------------|
| `portfolio:summary` | Overview of all clients |
| `client:report --business "name"` | Detailed report for one client |
| `prioritize:today` | What needs attention |
| `quick-wins:find` | Keywords close to page 1 |
| `at-risk:clients` | Clients who might churn |
| `audit:run --url "..."` | Run GMB audit (500 credits) |
| `recommendations:get --business "name"` | How to help a client |
| `email:draft --business "name"` | Draft update email |

See [SKILL.md](./SKILL.md) for full documentation.

## Requirements

- Node.js 18+ (uses built-in fetch)
- LocalRank API key

## License

MIT
