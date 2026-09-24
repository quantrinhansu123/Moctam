# Content Management Feature — End-to-End Implementation Plan

## Overview

The Admin → "Nội Dung" (Content) panel already has a working UI in:

`frontend/src/components/admin/AdminContentPanel.tsx`

It already communicates with the backend:

- `GET /api/products` — public product read
- `PUT /api/admin/products/:id` — admin-only product update

The backend already has CRUD support for the `site_products` Supabase table.

### What is currently missing

The existing Admin → "Nội Dung" UI does not yet manage all content displayed on the public/main page.

The following content is currently hardcoded or not editable:

1. Hero slides on the Shop page are hardcoded in `data/products.ts`.
2. Footer contact information is hardcoded in `SiteFooter.tsx`.
3. Announcement bar items are hardcoded in `AnnouncementBar.tsx`.
4. Product `content.*` fields are not editable from the Admin UI:
   - features
   - steps
   - stories
   - benefits
   - stats
   - miniReviews
   - accordions
   - faq

The goal is to make **all content currently displayed on the public/main page editable from Admin → "Nội Dung"** while preserving the existing UI and architecture.

---

# Architecture Decision

Reuse the existing product CMS architecture.

## Product-specific content

Continue using `site_products` with the existing JSONB `content` field:

```text
site_products
└── content JSONB
    ├── features
    ├── steps
    ├── stories
    ├── benefits
    ├── stats
    ├── miniReviews
    ├── accordions
    └── faq
```

Do not create separate database tables for each content array unless the existing schema requires it.

## Site-wide content

Add a new `site_settings` table for global/public-page settings such as:

```text
site_settings
└── data JSONB
    ├── heroSlides
    ├── announcementBar
    └── footer
```

This keeps product-specific content and site-wide content separate.

---

# Backend

## 1. Modify `backend/src/supabase.js`

Add:

- `getSiteSettings()`
- `upsertSiteSettings(settings)`

Use the existing Supabase client and project conventions.

The table should use a single global row.

Recommended schema:

```text
site_settings
- id
- key          UNIQUE
- data         JSONB
- created_at
- updated_at
```

The global row should use:

```text
key = "global"
```

Do not create multiple rows for the same global settings object.

---

## 2. Create `backend/src/data/site_settings.defaults.json`

Add the default values currently hardcoded in:

- `ShopScreen.tsx`
- `AnnouncementBar.tsx`
- `SiteFooter.tsx`

The defaults must preserve the current public-page behavior and content.

Do not invent new content.

---

## 3. Modify `backend/src/index.js`

Add:

### Public endpoint

`GET /api/settings`

Behavior:

1. Read the persisted `site_settings` global row.
2. Merge persisted settings with `site_settings.defaults.json`.
3. Return the resulting settings.
4. Never expose admin-only information.

### Admin endpoint

`PUT /api/admin/settings`

Behavior:

1. Require the same authentication/authorization mechanism already used by existing admin endpoints.
2. Validate the incoming payload.
3. Persist the settings to `site_settings`.
4. Return the saved settings.

Do not create a separate authentication system.

---

# Important Bootstrap Requirement

Add `bootstrapSiteSettings()` if necessary to seed the initial settings.

However:

**`bootstrapSiteSettings()` must NEVER overwrite existing admin-edited settings.**

It may only create the default `global` row when the row does not already exist.

Required behavior:

```text
No site_settings row
        ↓
Insert defaults

Existing site_settings row
        ↓
Do nothing
```

Server restarts, Render restarts, deployments, and backend startups must never reset admin-edited content back to defaults.

---

# Settings Merge Behavior

Defaults should act as fallback values, not as a source that overwrites saved values.

Conceptually:

```text
defaults
   +
persisted settings
   ↓
effective settings
```

If an admin has changed a value, the persisted value must win.

If a new setting exists in the defaults but is missing from older persisted data, the default value may be used as fallback.

---

# Frontend — Admin UI

## 1. Modify `AdminContentPanel.tsx`

The existing UI must remain intact.

Do not:

- redesign the Admin page
- replace the existing layout
- create a new Admin page
- create a parallel CMS
- replace existing components unnecessarily
- change the existing visual style

Reuse the existing `admin-content-card` pattern and existing form/input styling.

---

# Product Content Editing

Extend the existing product editor so that all existing `content.*` fields can be edited:

- features
- steps
- stories
- benefits
- stats
- miniReviews
- accordions
- faq

## Do NOT use raw JSON textarea editors

Do not make the admin manually edit JSON.

Instead, create simple dynamic list editors using normal form controls.

Example:

```text
Features

[ Feature 1 ]
Title
[........................]

Description
[........................]

[Remove]

[ Feature 2 ]
Title
[........................]

Description
[........................]

[Remove]

[+ Add Feature]
```

Use the actual fields already defined by the existing data/schema.

Do not invent new fields.

Apply the same pattern to all existing `content.*` arrays.

The UI does not need to be visually complex. It only needs to provide reliable editing of the existing data structures.

---

# Site Settings Admin Section

Add a new section inside the existing Admin → "Nội Dung" page.

Use the same existing `admin-content-card` layout and styling.

## Hero Slides

Allow editing of every existing hero-slide property, including:

- image
- title
- subtitle
- description
- link/action if present
- any other property currently used by `ShopScreen.tsx`

Do not remove existing fields.

## Announcement Bar

Allow editing of all existing announcement-bar properties.

At minimum:

- text/content
- link/action if currently supported
- ordering
- enabled/disabled state if the existing data structure supports it

Use the actual existing structure from `AnnouncementBar.tsx`.

## Footer

Allow editing of all existing footer contact information, including:

- address
- phone
- hours
- tax ID
- links
- any other currently hardcoded footer content

Use the actual existing structure from `SiteFooter.tsx`.

---

# Image Handling

Image upload is **out of scope for this implementation**.

Keep the existing URL-string approach.

The Admin UI should allow the admin to enter/change an image URL.

The URL must be persisted in:

- `site_products`, or
- `site_settings`

depending on whether the image belongs to a product or site-wide setting.

Do not introduce a new image-upload system.

Do not add a new storage provider.

Do not store large image binaries directly in the database.

---

# Frontend — Public Pages

## 1. Create `frontend/src/lib/siteSettings.ts`

Implement:

- `SiteSettingsProvider`
- `useSiteSettings`

Follow the same architectural pattern already used by `ProductProvider`.

The provider should:

1. Fetch `GET /api/settings`.
2. Store the settings in React context.
3. Expose the settings through `useSiteSettings()`.
4. Handle loading/error states consistently with existing application patterns.

## 2. Modify `App.tsx`

Wrap the application with:

```tsx
<SiteSettingsProvider>
    ...
</SiteSettingsProvider>
```

Place it according to the existing provider architecture.

Do not unnecessarily restructure existing providers.

## 3. Modify `ShopScreen.tsx`

Remove the hardcoded hero-slide source from `data/products.ts`.

Instead, use `useSiteSettings()` and render the persisted hero-slide settings.

## 4. Modify `AnnouncementBar.tsx`

Remove the hardcoded `ITEMS` array.

Use `useSiteSettings()` to render announcement-bar data.

## 5. Modify `SiteFooter.tsx`

Remove hardcoded contact information.

Use `useSiteSettings()` for:

- address
- phone
- hours
- tax ID
- links
- other configurable footer content

---

# Data Flow

```text
Admin → Nội Dung
        ↓
Admin UI
        ↓
Node.js API
        ↓
Service / Repository
        ↓
Supabase
        ↓
site_products / site_settings
        ↓
Public API
        ↓
ProductProvider / SiteSettingsProvider
        ↓
Public Page
```

---

# Validation

Add appropriate validation for editable fields.

## Prices

- must be valid numeric values
- reject invalid/NaN values
- reject malformed price structures

## URLs

Validate image/link URLs where the existing application expects URLs.

## Required fields

Do not allow required existing fields to become invalid or missing.

## Arrays

Ensure `features`, `steps`, `stories`, etc. remain valid arrays.

## Settings

Reject malformed `site_settings` payloads.

Use the existing backend validation/error-handling conventions.

---

# Authentication & Authorization

Only authenticated and authorized admin users may modify:

- `PUT /api/admin/products/:id`
- `PUT /api/admin/settings`

Public users may:

- `GET /api/products`
- `GET /api/settings`

but must never be able to modify content.

Reuse the existing JWT/admin authorization implementation.

Do not create another auth mechanism.

---

# Error Handling

The Admin UI must properly handle:

- loading
- saving
- validation errors
- authentication errors
- authorization errors
- network errors
- backend errors

After a successful save:

1. Update the Admin UI state.
2. Keep the saved value in the current draft/state.
3. Ensure a subsequent API fetch returns the persisted value.

Do not silently fall back to hardcoded values when an API request fails.

If defaults are used, they must come from the centralized defaults files.

---

# Persistence Requirements

All Admin content changes must survive:

- page refresh
- frontend restart
- backend restart
- Render restart
- deployment

Do not store the actual CMS state only in React state/localStorage.

Supabase must be the persistent source of truth.

---

# Backward Compatibility

Do not break:

- existing product CRUD
- existing Admin functionality
- public product display
- authentication
- payment functionality
- existing API contracts
- existing database data

Do not unnecessarily rename existing endpoints or fields.

Extend the current system rather than replacing it.

---

# Implementation Order

## Phase 1 — Inspect

Before coding:

1. Inspect `AdminContentPanel.tsx`.
2. Inspect `ShopScreen.tsx`.
3. Inspect `AnnouncementBar.tsx`.
4. Inspect `SiteFooter.tsx`.
5. Inspect `ProductProvider.tsx`.
6. Inspect current Node.js backend architecture.
7. Inspect existing `site_products` schema and API.
8. Inspect the exact structures of all existing product `content.*` fields.
9. Inspect current authentication/authorization middleware.

Do not code before understanding the existing structures.

## Phase 2 — Site Settings Backend

Implement:

```text
site_settings.defaults.json
site_settings SQL migration
getSiteSettings()
upsertSiteSettings()
GET /api/settings
PUT /api/admin/settings
bootstrapSiteSettings()
```

Verify that bootstrap never overwrites existing data.

## Phase 3 — Site Settings Frontend

Implement:

```text
SiteSettingsProvider
useSiteSettings()
```

Then migrate:

```text
ShopScreen
AnnouncementBar
SiteFooter
```

from hardcoded values to API-backed settings.

## Phase 4 — Product Content Editor

Extend `AdminContentPanel.tsx` to edit:

```text
features
steps
stories
benefits
stats
miniReviews
accordions
faq
```

Use dynamic form lists, not raw JSON editing.

## Phase 5 — Integration

Connect:

```text
Admin UI
→ API
→ Supabase
→ Provider
→ Public page
```

Verify every content type.

---

# Verification

## Backend

Verify:

- `GET /api/settings` returns the effective settings.
- `PUT /api/admin/settings` requires admin authentication.
- Changes persist in Supabase.
- Restarting the backend does not reset settings.
- Malformed payloads return an appropriate 4xx response.

## Frontend

Run:

```bash
cd frontend
npx tsc --noEmit
```

Also run the project's existing build command if one exists.

---

# Manual Tests

## Product

1. Change a product price.
2. Save.
3. Refresh Admin.
4. Verify the price remains changed.
5. Open the Shop page.
6. Verify the new price is displayed.

## Hero

1. Change a hero image URL.
2. Save.
3. Refresh.
4. Verify the new hero image is displayed.

## Footer

1. Change the address.
2. Save.
3. Refresh.
4. Verify the new address appears in the footer.

## Announcement

1. Change announcement text.
2. Save.
3. Refresh.
4. Verify the new text appears.

## Product Content

Test editing at least one item in each:

- features
- steps
- stories
- benefits
- stats
- miniReviews
- accordions
- faq

Save, refresh, and verify the changes remain.

## Authorization

Log out or use an unauthorized user.

Verify:

```text
PUT /api/admin/settings
```

returns `401` or `403` according to the existing authentication behavior.

Also verify the same protection remains in place for:

```text
PUT /api/admin/products/:id
```

---

# Critical Acceptance Criteria

The implementation is complete only when:

- [ ] Existing Admin → "Nội Dung" UI is preserved.
- [ ] Product prices are editable.
- [ ] Product images are editable.
- [ ] Product titles/descriptions are editable.
- [ ] Product `content.*` arrays are editable.
- [ ] Hero slides are editable.
- [ ] Announcement bar is editable.
- [ ] Footer information is editable.
- [ ] All managed content persists in Supabase.
- [ ] Public pages read the persisted values.
- [ ] No managed public content remains hardcoded.
- [ ] Image URLs persist correctly.
- [ ] Admin authorization is enforced.
- [ ] Invalid input is rejected.
- [ ] Server restart does not reset content.
- [ ] Existing functionality continues working.
- [ ] TypeScript passes.
- [ ] Production build passes.
- [ ] No duplicate CMS/content-management system was introduced.

Do not consider the feature complete merely because the UI renders or TypeScript compiles. Verify the complete Admin → API → Supabase → Public Page flow.
