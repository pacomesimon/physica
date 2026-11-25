import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BLUEPRINT_LIMITS, clampString, sanitizeFirestoreId } from '../src/lib/firebase';

const rootDir = process.cwd();
const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'firebase-blueprint.json'), 'utf8')
) as {
  entities: Record<
    string,
    {
      properties: Record<string, { maxLength?: number; minLength?: number; enum?: string[]; pattern?: string }>;
      required: string[];
    }
  >;
  firestore: Record<string, { schema: { $ref: string }; description: string }>;
};
const appletConfig = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'firebase-applet-config.json'), 'utf8')
) as {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
};

describe('Firestore Security Rules & Blueprint Compliance (Dirty Dozen + Eight Pillars)', () => {
  it('enforces rules_version 2 and global default-deny catch-all at top', () => {
    assert.match(rulesText, /rules_version\s*=\s*'2';/);
    const catchAllIdx = rulesText.indexOf('match /{document=**}');
    const usersMatchIdx = rulesText.indexOf('match /users/{userId}');
    assert.ok(catchAllIdx > 0, 'Global catch-all match /{document=**} must exist');
    assert.ok(catchAllIdx < usersMatchIdx, 'Global catch-all must appear before collection rules');
    assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  });

  it('enforces verified authentication and strict owner isolation (Dirty Dozen #1, #2, #3, #12)', () => {
    assert.match(rulesText, /request\.auth != null/);
    assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
    assert.match(rulesText, /function isOwner\(userId\)\s*\{\s*return isVerified\(\) && request\.auth\.uid == userId;/);
    // PII protection on /users/{userId}: never allow listing users collection
    assert.match(rulesText, /match \/users\/\{userId\}[\s\S]*?allow list: if false;/);
  });

  it('prevents shadow field injection via strict hasAll + hasOnly on all 4 entities (Dirty Dozen #4)', () => {
    const entityValidators = [
      { fn: 'isValidUserProfile', entity: 'UserProfile' },
      { fn: 'isValidProject', entity: 'SimulationProjectDoc' },
      { fn: 'isValidVersion', entity: 'SimulationVersionDoc' },
      { fn: 'isValidMessage', entity: 'ProjectMessageDoc' },
    ];

    for (const { fn, entity } of entityValidators) {
      const fnIdx = rulesText.indexOf(`function ${fn}(`);
      assert.ok(fnIdx > -1, `Validator ${fn} must exist in firestore.rules`);
      const nextFnIdx = rulesText.indexOf('\n    function ', fnIdx + 10);
      const body = rulesText.slice(fnIdx, nextFnIdx > -1 ? nextFnIdx : undefined);

      assert.ok(body.includes('data.keys().hasAll(['), `${fn} must enforce data.keys().hasAll`);
      assert.ok(body.includes('data.keys().hasOnly(['), `${fn} must enforce data.keys().hasOnly`);

      const schema = blueprint.entities[entity];
      assert.ok(schema, `Blueprint must define entity ${entity}`);
      for (const reqField of schema.required) {
        assert.ok(body.includes(`'${reqField}'`), `${fn} must validate required field '${reqField}'`);
      }
      for (const propName of Object.keys(schema.properties)) {
        assert.ok(body.includes(`'${propName}'`), `${fn} must allow blueprint field '${propName}'`);
      }
    }
  });

  it('enforces identity binding, Master Gate relational integrity, and immutable subcollections (Dirty Dozen #5, #6)', () => {
    assert.match(rulesText, /data\.uid == request\.auth\.uid/);
    assert.match(rulesText, /data\.ownerId == request\.auth\.uid/);
    assert.match(rulesText, /existsAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
    assert.match(rulesText, /existsAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\/projects\/\$\(projectId\)\)/);
    // Versions & messages are append-only
    const versionBlock = rulesText.slice(rulesText.indexOf('match /versions/{versionId}'), rulesText.indexOf('match /messages/{messageId}'));
    const messageBlock = rulesText.slice(rulesText.indexOf('match /messages/{messageId}'));
    assert.match(versionBlock, /allow update: if false;/);
    assert.match(messageBlock, /allow update: if false;/);
  });

  it('prevents ID poisoning on single-doc ops while keeping list rules free of own-wildcard isValidId and lookups (Dirty Dozen #7, #12)', () => {
    assert.match(rulesText, /function isValidId\(id\)\s*\{\s*return id is string && id\.size\(\) >= 1 && id\.size\(\) <= 128 && id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\);/);

    const listMatches = rulesText.match(/allow list:[^;]+;/g) ?? [];
    assert.ok(listMatches.length >= 4, 'Should define explicit allow list rules for all 4 collections');
    for (const rule of listMatches) {
      assert.ok(!rule.includes('get(') && !rule.includes('exists(') && !rule.includes('getAfter(') && !rule.includes('existsAfter('),
        `allow list rule must not invoke get/exists lookups: ${rule}`);
    }

    // Specific check: projects list rule must NOT validate projectId, versions list must NOT validate versionId, messages list must NOT validate messageId
    assert.ok(rulesText.includes('allow list: if isOwner(userId) && isValidId(userId) && existing().ownerId == request.auth.uid;'));
    assert.ok(rulesText.includes('allow list: if isOwner(userId) && isValidId(userId) && isValidId(projectId) && existing().ownerId == request.auth.uid;'));
  });

  it('enforces Denial-of-Wallet size ceilings, request.time timestamps, and action-based immutable updates (Dirty Dozen #8, #9, #10, #11)', () => {
    assert.ok(rulesText.includes('data.title.size() <= 120'));
    assert.ok(rulesText.includes('data.currentHtml.size() <= 500000'));
    assert.ok(rulesText.includes('data.content.size() <= 20000'));
    assert.ok(rulesText.includes('incoming().createdAt == request.time'));
    assert.ok(rulesText.includes('incoming().updatedAt == request.time'));
    assert.ok(rulesText.includes('incoming().createdAt == existing().createdAt'));
    assert.ok(rulesText.includes('incoming().ownerId == existing().ownerId'));
    assert.ok(rulesText.includes('incoming().uid == existing().uid'));
    assert.ok(rulesText.includes('incoming().diff(existing()).affectedKeys().hasOnly(['));
  });

  it('synchronizes BLUEPRINT_LIMITS with firebase-blueprint.json and sanitizes poisoned IDs/strings', () => {
    assert.equal(BLUEPRINT_LIMITS.DISPLAY_NAME_MAX_LEN, blueprint.entities.UserProfile.properties.displayName.maxLength);
    assert.equal(BLUEPRINT_LIMITS.EMAIL_MAX_LEN, blueprint.entities.UserProfile.properties.email.maxLength);
    assert.equal(BLUEPRINT_LIMITS.PROJECT_TITLE_MAX_LEN, blueprint.entities.SimulationProjectDoc.properties.title.maxLength);
    assert.equal(BLUEPRINT_LIMITS.HTML_MAX_LEN, blueprint.entities.SimulationProjectDoc.properties.currentHtml.maxLength);
    assert.equal(BLUEPRINT_LIMITS.VERSION_DESC_MAX_LEN, blueprint.entities.SimulationVersionDoc.properties.description.maxLength);
    assert.equal(BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX_LEN, blueprint.entities.ProjectMessageDoc.properties.content.maxLength);

    // Dirty Dozen #7: ID poisoning sanitization
    const poisoned = sanitizeFirestoreId('../evil/path?hack=1', 'proj');
    assert.match(poisoned, BLUEPRINT_LIMITS.ID_PATTERN);
    assert.ok(poisoned.length <= BLUEPRINT_LIMITS.ID_MAX_LEN);

    const oversizedId = sanitizeFirestoreId('a'.repeat(250), 'proj');
    assert.equal(oversizedId.length, BLUEPRINT_LIMITS.ID_MAX_LEN);

    const emptyId = sanitizeFirestoreId('///...', 'proj');
    assert.match(emptyId, /^proj-\d+$/);

    // Dirty Dozen #8: string clamping
    assert.equal(clampString('x'.repeat(200), 120).length, 120);
  });

  it('configures the named Firestore database ID from firebase-applet-config.json', () => {
    assert.ok(appletConfig.projectId && appletConfig.projectId.length > 0);
    assert.ok(appletConfig.firestoreDatabaseId && appletConfig.firestoreDatabaseId.length > 0);
    const firebaseSrc = fs.readFileSync(path.join(rootDir, 'src/lib/firebase.ts'), 'utf8');
    assert.ok(
      firebaseSrc.includes('getFirestore(app, firebaseConfig.firestoreDatabaseId)'),
      'src/lib/firebase.ts must pass firebaseConfig.firestoreDatabaseId to getFirestore'
    );
  });
});
