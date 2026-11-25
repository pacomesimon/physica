# Physica Studio — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Relationship Mapping
- **Master Source of Truth**: `/users/{userId}` is the root owner record for every authenticated user.
- **Guest Mode Isolation**: Unauthenticated visitors operate exclusively in browser `localStorage` and never have read or write access to any Firestore document.
- **PII Isolation**: `/users/{userId}` stores private account `email` and preferences; reads and writes are strictly limited to `request.auth.uid == userId` with verified email (`request.auth.token.email_verified == true`).
- **Relational Sync (Master Gate)**:
  - `/users/{userId}/projects/{projectId}` requires parent `/users/{userId}` to exist on create and `ownerId == request.auth.uid`.
  - `/users/{userId}/projects/{projectId}/versions/{versionId}` and `.../messages/{messageId}` require parent project `/users/{userId}/projects/{projectId}` to exist with `data.ownerId == request.auth.uid`.
- **Immutability & Temporal Integrity**:
  - `uid`, `ownerId`, `projectId`, and `createdAt` are immutable after creation.
  - All `createdAt` (on create) and `updatedAt` (on create/update) fields must strictly equal `request.time`.
  - Version snapshots (`versions`) and chat messages (`messages`) are append-only (no client updates).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Guest attempts `get` or `create` on `/users/u1/projects/p1` with `auth == null`.
2. **Cross-User PII Leak**: Authenticated `u2` attempts `get` on `/users/u1` (contains `email`).
3. **Unverified Email Spoofing**: Authenticated `u1` with `email_verified: false` attempts `create` on `/users/u1`.
4. **Shadow Field Injection (Ghost Field)**: `u1` creates `/users/u1` with extra field `isAdmin: true` or `role: "admin"`.
5. **Identity Spoofing on Create**: `u1` creates `/users/u1/projects/p1` with `ownerId: "u2"`.
6. **Orphaned Subcollection Write**: `u1` creates `/users/u1/projects/missing-proj/versions/v1` when parent project does not exist.
7. **ID Poisoning**: `u1` attempts `create` with a 200-char or invalid-character (`../evil`) `projectId`.
8. **Denial of Wallet Size Exhaustion**: `u1` attempts `create` on `projects/p1` with `title` length > 120 or `currentHtml` > 500,000 bytes.
9. **Client-Forged Timestamp**: `u1` creates a project with `createdAt` set to a past timestamp instead of `request.time`.
10. **Immutable Field Tampering**: `u1` updates `/users/u1/projects/p1` attempting to alter `ownerId` or `createdAt`.
11. **Value Poisoning on Allowed Update Field**: `u1` updates `/users/u1/projects/p1` setting `title: 12345` (non-string) or `versionCount: -5`.
12. **Cross-Tenant List Scraping**: `u2` attempts `list` on `/users/u1/projects`.
