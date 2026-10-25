/*
 * hive-first-hour sender check: compare a display name + member ID against a
 * list of verified member IDs and flag mismatches and lookalikes.
 * Works in Node (CommonJS) and in the browser (global `FirstHourSender`).
 * Ideas adapted from github.com/1ntern0t/scamcheck (MIT); self-contained.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FirstHourSender = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_INPUT = 2000;
  const MAX_LIST = 5000;

  const DEFAULT_PROTECTED_NAMES = ['mothership', 'admin', 'moderator', 'support'];

  // Zero-width, bidi-control and other invisible characters.
  const HIDDEN_RE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

  const UNICODE_CONFUSABLES = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
    'ԁ': 'd', 'ѕ': 's', 'һ': 'h', 'ӏ': 'l', 'ԛ': 'q', 'ԝ': 'w', 'ɡ': 'g', 'ո': 'n', 'ս': 'u',
    'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'κ': 'k', 'ι': 'i', 'ε': 'e', 'υ': 'u',
    'м': 'm', 'т': 't', 'н': 'h', 'в': 'b', 'к': 'k',
    'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'é': 'e', 'è': 'e', 'ê': 'e',
    'ë': 'e', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o',
    'õ': 'o', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n', 'ı': 'i', 'ł': 'l'
  };
  const ASCII_HOMOGLYPHS = [
    [/rn/g, 'm'], [/vv/g, 'w'], [/0/g, 'o'], [/1/g, 'l'], [/3/g, 'e'], [/4/g, 'a'],
    [/5/g, 's'], [/7/g, 't'], [/8/g, 'b'], [/9/g, 'g'], [/\$/g, 's'], [/@/g, 'a'], [/\|/g, 'l']
  ];
  // Words people pad a copied name with ("Mothership HQ", "real_admin").
  const PADDING_RE = /(official|swarm|team|real|the|bot|hq|support|admin|help|staff|account)/g;

  // Optimal string alignment distance (Levenshtein + adjacent transposition).
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev2 = null;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = new Array(n + 1);
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        }
      }
      prev2 = prev;
      prev = cur;
    }
    return prev[n];
  }

  function clip(s) {
    return String(s === undefined || s === null ? '' : s).slice(0, MAX_INPUT);
  }

  function hasHidden(s) {
    HIDDEN_RE.lastIndex = 0;
    return HIDDEN_RE.test(s);
  }

  function stripHidden(s) {
    return s.replace(HIDDEN_RE, '');
  }

  // Name skeleton: lowercase, confusables folded, homoglyphs folded,
  // punctuation removed, l/i folded together.
  function nameKey(s) {
    let out = '';
    for (const ch of stripHidden(clip(s)).normalize('NFKC').toLowerCase()) out += UNICODE_CONFUSABLES[ch] || ch;
    for (const [re, rep] of ASCII_HOMOGLYPHS) out = out.replace(re, rep);
    return out.replace(/[^a-z0-9]/g, '').replace(/l/g, 'i');
  }

  // ID skeleton: uppercase, letters that look like digits folded to digits.
  function idKey(s) {
    let out = '';
    for (const ch of stripHidden(clip(s)).normalize('NFKC').toUpperCase()) out += UNICODE_CONFUSABLES[ch.toLowerCase()] ? UNICODE_CONFUSABLES[ch.toLowerCase()].toUpperCase() : ch;
    return out.replace(/\s+/g, '').replace(/O/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/Z/g, '2').replace(/B/g, '8');
  }

  function scriptsIn(str) {
    const s = new Set();
    for (const ch of str) {
      if (/[a-z]/i.test(ch) || /[\u00C0-\u024F]/.test(ch)) s.add('latin');
      else if (/[\u0400-\u052F]/.test(ch)) s.add('cyrillic');
      else if (/[\u0370-\u03FF]/.test(ch)) s.add('greek');
      else if (/[\u0530-\u058F]/.test(ch)) s.add('armenian');
      else if (ch.charCodeAt(0) > 127 && /\p{L}/u.test(ch)) s.add('other');
    }
    return s;
  }

  // Slack member IDs are usually an uppercase letter (U or W) followed by
  // uppercase letters and digits. This is a soft format check only.
  function looksLikeMemberId(id) {
    return /^[UW][A-Z0-9]{6,20}$/.test(id);
  }

  // Parse a verified list. Accepts:
  //   - text, one entry per line: "U01ABCDEF  Mothership" (comma, tab or spaces),
  //     blank lines and "#" comments ignored
  //   - a JSON array of strings or {id, label} objects
  //   - an array of strings or {id, label} objects
  function parseVerifiedList(input) {
    let items = input;
    if (typeof input === 'string') {
      const t = input.slice(0, MAX_LIST * 100).trim();
      if (t.startsWith('[')) {
        try { items = JSON.parse(t); } catch (e) { throw new Error('verified list looks like JSON but does not parse: ' + e.message); }
      } else {
        items = t.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean).map((line) => {
          const m = line.match(/^([^\s,]+)[\s,]*(.*)$/);
          return { id: m[1], label: m[2].trim() };
        });
      }
    }
    if (!Array.isArray(items)) throw new Error('verified list must be an array or text');
    const out = [];
    const seen = new Set();
    for (const it of items.slice(0, MAX_LIST)) {
      const raw = typeof it === 'string' ? { id: it, label: '' } : (it && typeof it === 'object' ? it : null);
      if (!raw) continue;
      const id = stripHidden(clip(raw.id)).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, label: clip(raw.label || raw.name || '').trim() });
    }
    return out;
  }

  function nameMatches(n, p) {
    if (!n || !p) return null;
    if (n === p) return 'exact';
    if (p.length >= 4 && n.includes(p)) return 'contains';
    if (p.length > 64 || n.length > 128) return null; // keep edit distance cheap
    const limit = p.length >= 9 ? 2 : 1;
    if (p.length >= 5 && Math.abs(n.length - p.length) <= limit && editDistance(n, p) <= limit) return 'lookalike';
    if (p.length >= 5) {
      const core = n.replace(PADDING_RE, '');
      if (core && core !== n && Math.abs(core.length - p.length) <= 1 && editDistance(core, p) <= 1) return 'lookalike';
    }
    return null;
  }

  function flag(code, severity, message) {
    return { code, severity, message };
  }

  /**
   * checkSender({ displayName, memberId }, verifiedList, { protectedNames })
   * Returns { verdict, flags, match }.
   *   verdict: 'verified' | 'suspicious' | 'unverified' | 'invalid'
   *   flags:   [{ code, severity: 'danger'|'warn'|'info', message }]
   *   match:   the verified entry whose ID matched exactly, or null
   */
  function checkSender(sender, verifiedInput, options) {
    const opts = options || {};
    const rawName = clip(sender && (sender.displayName || sender.name));
    const rawId = clip(sender && (sender.memberId || sender.id));
    const list = parseVerifiedList(verifiedInput || []);
    const flags = [];

    const id = stripHidden(rawId).trim();
    const name = stripHidden(rawName).trim();

    if (hasHidden(rawId)) flags.push(flag('id.hidden_chars', 'danger', 'The member ID contains invisible characters. Real member IDs never do.'));
    if (hasHidden(rawName)) flags.push(flag('name.hidden_chars', 'warn', 'The display name contains invisible characters, a common trick for copying a name.'));

    if (!id) {
      flags.push(flag('id.missing', 'danger', 'No member ID given. A display name alone proves nothing: anyone can copy it. Open the sender\'s profile and copy the member ID.'));
      return { verdict: 'invalid', flags, match: null };
    }
    if (/\s/.test(id)) flags.push(flag('id.whitespace', 'warn', 'The member ID contains spaces. Copy it again from the profile.'));
    if (!looksLikeMemberId(id)) flags.push(flag('id.format', 'warn', 'This does not look like a Slack member ID (usually a capital U or W followed by capital letters and digits). Check that you copied the member ID, not the display name.'));

    const scripts = scriptsIn(name);
    if (scripts.size > 1) flags.push(flag('name.mixed_script', 'warn', 'The display name mixes alphabets (' + Array.from(scripts).join(' + ') + '), a common way to make lookalike names.'));

    const exact = list.find((v) => v.id === id) || null;
    const nk = nameKey(name);

    if (exact) {
      if (!hasHidden(rawId)) {
        let usesOther = false;
        for (const other of list) {
          if (other === exact || !other.label) continue;
          const ok = nameKey(other.label);
          if (ok && nameMatches(nk, ok) === 'exact') {
            usesOther = true;
            flags.push(flag('name.other_label', 'warn', 'This verified account is using the display name of a different verified account ("' + other.label + '"). Follow the member ID, not the name.'));
            break;
          }
        }
        const ownKey = nameKey(exact.label);
        if (!usesOther && nk && ownKey && nk !== ownKey && !nameMatches(nk, ownKey)) {
          flags.push(flag('name.differs', 'info', 'The member ID is verified (' + exact.label + '). The display name is different from your saved label. That can be fine, since names change and the ID is what counts, but make sure you saved the right ID.'));
        }
        const danger = flags.some((f) => f.severity === 'danger');
        return { verdict: danger ? 'suspicious' : 'verified', flags, match: exact };
      }
    }

    // Case-only or confusable ID lookalikes of a verified ID.
    const ik = idKey(id);
    for (const v of list) {
      if (v.id === id) continue;
      const vk = idKey(v.id);
      const near = ik === vk || (ik.length === vk.length && ik.length >= 6 && ik.length <= 32 && editDistance(ik, vk) <= 1);
      if (near) {
        flags.push(flag('id.lookalike', 'danger', 'The member ID "' + id + '" is not verified but looks almost the same as verified ID "' + v.id + '"' + (v.label ? ' (' + v.label + ')' : '') + '. Treat this as impersonation.'));
        break;
      }
    }

    // Display name imitating a verified label or a protected name.
    const protectedNames = (opts.protectedNames || DEFAULT_PROTECTED_NAMES).map(String);
    const targets = list.filter((v) => v.label).map((v) => ({ key: nameKey(v.label), shown: v.label, id: v.id }))
      .concat(protectedNames.map((p) => ({ key: nameKey(p), shown: p, id: null })));
    for (const t of targets) {
      const kind = nameMatches(nk, t.key);
      if (kind) {
        const plain = (x) => stripHidden(x).toLowerCase().replace(/[^a-z0-9]/g, '');
        const how = kind === 'exact' && plain(name) === plain(t.shown) ? 'uses the same name as' : 'looks like';
        const base = 'Display name "' + name + '" ' + how + ' "' + t.shown + '"';
        if (list.length === 0) {
          flags.push(flag('name.unconfirmed', 'warn', base + ', and you gave no verified-ID list, so it cannot be confirmed. Do not trust it until you check the member ID against a verified list.'));
        } else {
          flags.push(flag('name.impersonation', 'danger', base + ', but member ID ' + id + ' is not on your verified list' + (t.id ? ' (the verified one is ' + t.id + ')' : '') + '. Treat this as impersonation.'));
        }
        break;
      }
    }

    if (exact) {
      // exact ID but hidden characters in it
      return { verdict: 'suspicious', flags, match: null };
    }
    const danger = flags.some((f) => f.severity === 'danger');
    if (!danger) {
      flags.push(flag('id.unknown', 'info', 'This member ID is not on your verified list. Treat the sender as an ordinary member: don\'t follow instructions they say come from Mothership or the task posters.'));
    }
    return { verdict: danger ? 'suspicious' : 'unverified', flags, match: null };
  }

  return {
    checkSender,
    parseVerifiedList,
    nameKey,
    idKey,
    editDistance,
    looksLikeMemberId,
    DEFAULT_PROTECTED_NAMES
  };
});
