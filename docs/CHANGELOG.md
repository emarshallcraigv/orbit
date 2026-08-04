# Changelog

Human-facing release log. Format based on [Keep a Changelog](https://keepachangelog.com/)
and [Semantic Versioning](https://semver.org/).

> **No versioned release has shipped yet.** The product is pre-1.0 and under active
> development (Phase 1 / V1). This file is the template and will start accruing
> entries at the first tagged release. Until then, the granular history lives in
> git and in [`../ROADMAP.md`](../ROADMAP.md).
>
> The engineering **version stream** (V1–V4) is tracked in `ROADMAP.md`; the
> customer-facing **phases** in [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md). A
> released `x.y.z` here should note which phase/version it belongs to.

## [Unreleased]

Work in progress toward the Phase 1 / V1 MVP (see
[`MVP_REQUIREMENTS.md`](MVP_REQUIREMENTS.md)). Not itemized here until the first
release cut.

---

## Template for a release entry

```markdown
## [x.y.z] — YYYY-MM-DD
### Added
- New capabilities, in customer-facing terms.
### Changed
- Changes to existing behavior.
### Fixed
- Bug fixes.
### Security
- Anything affecting tenant isolation, auth, or data protection.
### Migrations
- Which numbered migration(s) this release requires (must be applied to
  staging then production, per STAGING.md).
```

## Guidelines
- Write entries for **customers/operators**, not commits — group by capability.
- Always call out **Security** and **Migrations** explicitly; a release that needs
  a migration must say so.
- Newest release on top; keep an `[Unreleased]` section as the staging area.
