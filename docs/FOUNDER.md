# FOUNDER.md

## Purpose

This document is the guiding philosophy for this company and this platform.

Before implementing any new feature, architectural change, or product decision, review this document.

The goal is not simply to build software.

The goal is to build a software company that creates exceptional operational software for healthcare organizations.

Every decision should support that mission.

---

# Founder Story

This platform was not created to enter the software industry.

It was created to solve operational problems experienced firsthand while managing a multi-location orthodontic practice.

Every feature should solve a real problem observed in day-to-day practice operations.

We will always prioritize practical workflows over unnecessary complexity.

The best ideas will come from listening to practices, observing their daily work, and continuously improving the product based on real-world experience.

Our competitive advantage is not that we build software.

Our competitive advantage is that we understand the people who use it.

---

# Company Mission

Build software that helps healthcare practices operate more efficiently by reducing operational complexity and giving teams better visibility into their business.

Our software should eliminate unnecessary manual work, reduce mistakes, improve communication, and allow healthcare professionals to focus on patient care instead of administrative processes.

---

# Long-Term Vision

The current platform begins with inventory management and purchasing workflows.

That is only the first step.

The long-term vision is to become the operational platform that healthcare practices rely on every day.

Future modules may include:

- Inventory
- Purchasing
- Vendor Management
- Equipment Management
- Analytics
- AI Operations Assistant
- Internal Tasks
- Reporting
- Maintenance
- Budgeting
- Additional operational tools

Every feature should be designed with this long-term vision in mind.

---

# Product Philosophy

We are not building software for software engineers.

We are building software for busy healthcare professionals.

The product should feel:

- intuitive
- fast
- reliable
- modern
- uncluttered

Every screen should answer:

"What is the user trying to accomplish?"

Not:

"What information can we display?"

The software should remove work.

Never create additional work.

---

# Target Customer

Initial market:

- Orthodontic practices
- General dental practices
- Pediatric dentistry
- Oral surgery
- Endodontics
- Periodontics

The architecture should remain generic enough that the platform can eventually expand into other industries without requiring major database changes.

Avoid assumptions that only apply to orthodontics whenever possible.

---

# Product Principles

Always prioritize:

1. Simplicity
2. Reliability
3. Security
4. Performance
5. Scalability

Every feature should provide meaningful value.

Avoid adding features simply because competitors have them.

---

# Engineering Philosophy

Build the platform correctly the first time whenever practical.

Prefer clean architecture over quick fixes.

Avoid technical debt whenever possible.

If additional work today prevents major refactoring later, choose the better long-term solution.

---

# Multi-Tenant Philosophy

This application is a true multi-tenant SaaS platform.

There is only one application.

There is only one codebase.

Every practice shares the same platform.

Every practice has completely isolated data.

No feature should ever assume a single customer.

No practice-specific logic should ever be hardcoded.

Every customer-specific value belongs in the database.

---

# Security

Security is not optional.

Every feature must respect:

- Row Level Security
- Authentication
- Authorization
- Least privilege access

Customer data is never shared across tenants.

Never bypass security for convenience.

---

# User Experience Standards

Every workflow should minimize clicks.

Users should always know:

- what needs attention
- what changed
- what to do next

The dashboard should prioritize action over information.

Avoid overwhelming users.

Use progressive disclosure where appropriate.

---

# Design Principles

Modern.

Minimal.

Professional.

Enterprise quality.

Consistent spacing.

Consistent typography.

Consistent colors.

Consistent component behavior.

The UI should feel trustworthy.

---

# Performance Standards

The application should feel responsive.

Optimize perceived performance.

Loading states should always exist.

Empty states should be intentional.

Errors should be understandable.

Avoid unnecessary database queries.

---

# Coding Standards

Write maintainable code.

Prefer readability over cleverness.

Avoid duplication.

Use reusable components.

Document complex decisions.

Write code assuming another engineer will maintain it.

---

# Database Standards

Normalize data appropriately.

Avoid duplicate information.

Every business object belongs to a Practice.

Relationships should be explicit.

Never hardcode IDs.

Use foreign keys.

Use Row Level Security.

Audit important actions.

---

# Future Integrations

The platform should be architected so the following services can be added without major refactoring:

- Stripe
- Resend
- PostHog
- Sentry
- Distributor APIs
- AI services
- Mobile applications

Design clean integration points now, but do not implement these services until they are needed in the product roadmap.

---

# Internal Administration Platform

The customer-facing platform is only one part of the business.

A completely separate internal administrative platform will eventually be developed for company administrators only.

This platform should eventually support:

- Practice management
- User management
- Subscription management
- Billing management
- Customer onboarding
- Feature flags
- Platform analytics
- Customer health metrics
- Product usage analytics
- Support tools
- Audit logs
- System monitoring

Do not build this platform yet.

Instead, ensure today's architecture supports adding it naturally in the future without major refactoring.

---

# Decision Framework

Before implementing any feature ask:

- Does this solve a real customer problem?
- Will most customers benefit?
- Does it simplify workflows?
- Does it align with the long-term vision?
- Can it scale?
- Will this increase technical debt?
- Would we still build this if we had 10,000 customers?

---

# Definition of Success

Success is not measured by:

- lines of code
- number of features
- number of screens

Success is measured by:

- time saved
- customer satisfaction
- reliability
- adoption
- retention
- operational efficiency

If customers cannot imagine operating without this platform, we have succeeded.

---

# Company Culture

Build with integrity.

Listen to customers.

Solve real problems.

Stay humble.

Continue improving.

Never stop learning.

---

# Final Principle

Every decision should increase the long-term value of the platform.

Build something customers trust.

Build something employees are proud of.

Build something that lasts.

---

After creating this document and `PRODUCT_VISION.md`, do NOT begin writing new product features.

Review the current project against both documents. This is not a from-scratch exercise — an architectural review and a prioritized Critical/High/Medium/Low plan already exist (in the engineering conversation history, and reflected in the current state of `ROADMAP.md` and the decision docs). Your job here is to cross-reference, not replace:

- Note where the current codebase already reflects these principles well (multi-tenant isolation, RLS-everywhere, industry-generic naming — these are already real, not aspirational).
- Flag anything in the current implementation that genuinely conflicts with this philosophy and isn't already on the existing priority list.
- Fold `PRODUCT_VISION.md`'s V4/V5 detail into `ROADMAP.md`'s existing (currently vague) "V4 and beyond" section, since it's more concrete than what's there now.
- Explicitly flag, rather than silently resolve, the gap between this document's six-role vision and the database's current three-role enum (`owner`/`admin`/`staff`) — this needs a deliberate decision, not an assumption in either direction.

Do not generate a new, independent Critical/High/Medium/Low list. Add to or adjust the existing one only where these documents surface something genuinely missing from it.

The next engineering steps are already defined and should proceed after this review, not be replaced by it.
