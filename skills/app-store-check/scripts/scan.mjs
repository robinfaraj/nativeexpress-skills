#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const SKIPPED_ANYWHERE = new Set(["node_modules", "__tests__", "__mocks__"]);
// Dot-directories (.git, .expo, agent skills under .claude/.agents) and root scripts/ hold tooling, not code that ships in the app.
const SKIPPED_AT_ROOT = new Set(["ios", "android", "dist", "build", "web-build", "coverage", "scripts"]);
// `_test.ts` is Deno's convention, used by Supabase edge functions.
const TEST_FILE = /(?:\.(?:test|spec)|_test)\.[cm]?[jt]sx?$/;
// Minified bundles and generated files only add noise and slow the scan.
const MAX_FILE_BYTES = 1_000_000;
const CONFIG_FILE_NAMES = ["app.json", "app.config.js", "app.config.ts", "app.config.mjs", "app.config.cjs"];
const MAX_FINDINGS = 50;
const MAX_LINE_CHARS = 160;
const STATUS_ORDER = ["fail", "warn", "pass", "n/a"];

const SECRET_LITERAL = /(?<![A-Za-z0-9])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}/g;

const AUTH_DEPS = [
  "@supabase/supabase-js", "firebase", "@react-native-firebase/auth", "@clerk/clerk-expo",
  "aws-amplify", "@aws-amplify/*", "expo-auth-session", "@react-native-google-signin/google-signin",
  "better-auth", "@better-auth/expo", "appwrite", "react-native-appwrite", "pocketbase",
];
const IAP_DEPS = [
  "react-native-purchases", "react-native-iap", "expo-iap", "expo-in-app-purchases",
  "@superwall/react-native-superwall", "expo-superwall", "react-native-adapty",
];
const REMOTE_PAYWALL_DEPS = ["@superwall/react-native-superwall", "expo-superwall", "react-native-adapty"];
const AI_DEPS = [
  "openai", "@anthropic-ai/sdk", "@google/generative-ai", "@google/genai", "ai", "@ai-sdk/*",
  "groq-sdk", "replicate", "@mistralai/mistralai", "cohere-ai", "@fal-ai/*", "elevenlabs",
];
const AI_IMPORT = /(?:from\s*|require\(\s*|import\(\s*)['"](?:npm:|jsr:|https?:\/\/esm\.sh\/)?(?:openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|ai|@ai-sdk\/[\w-]+|groq-sdk|replicate|@mistralai\/mistralai|cohere-ai|@fal-ai\/[\w-]+|elevenlabs)(?:@[\w.^~-]+)?(?:\/[\w./-]*)?['"]/;
const AI_HOST = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai|api\.replicate\.com|api\.groq\.com|api\.mistral\.ai|fal\.run|api\.elevenlabs\.io/;
const AI_KEY_ENV = /\b(?:EXPO_PUBLIC|REACT_NATIVE)_(?:[A-Z0-9]+_)*?(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE_AI|GROQ|REPLICATE|OPENROUTER|ELEVENLABS|MISTRAL|FAL)(?:_[A-Z0-9]+)*\b/;
const AI_CLIENT = /new (?:OpenAI|Anthropic|GoogleGenerativeAI|GoogleGenAI)\(|create(?:OpenAI|Anthropic)\(/;

const PURPOSE_STRINGS = {
  "expo-camera": [["NSCameraUsageDescription", "cameraPermission"], ["NSMicrophoneUsageDescription", "microphonePermission"]],
  "expo-image-picker": [["NSPhotoLibraryUsageDescription", "photosPermission"], ["NSCameraUsageDescription", "cameraPermission"], ["NSMicrophoneUsageDescription", "microphonePermission"]],
  "expo-media-library": [["NSPhotoLibraryUsageDescription", "photosPermission"], ["NSPhotoLibraryAddUsageDescription", "savePhotosPermission"]],
  "expo-location": [["NSLocationWhenInUseUsageDescription", "locationWhenInUsePermission"]],
  "expo-contacts": [["NSContactsUsageDescription", "contactsPermission"]],
  "expo-calendar": [["NSCalendarsUsageDescription", "calendarPermission"]],
  "expo-audio": [["NSMicrophoneUsageDescription", "microphonePermission"]],
  "expo-av": [["NSMicrophoneUsageDescription", "microphonePermission"]],
  "expo-tracking-transparency": [["NSUserTrackingUsageDescription", "userTrackingPermission"]],
  "expo-local-authentication": [["NSFaceIDUsageDescription", "faceIDPermission"]],
  "expo-sensors": [["NSMotionUsageDescription", "motionPermission"]],
};
const EXPO_DEFAULT_PURPOSE = /^Allow \$\(PRODUCT_NAME\) to/;
const MIN_PURPOSE_CHARS = 25;

const toPosix = (p) => p.split(path.sep).join("/");

function isServerPath(rel) {
  return (
    /^(?:supabase\/functions|functions|server|api)\//.test(rel) ||
    /(?:^|\/)app\/api\//.test(rel) ||
    /\+api\.[cm]?[jt]sx?$/.test(rel)
  );
}

function collectSourceFiles(root, dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const skipped = entry.name.startsWith(".") || SKIPPED_ANYWHERE.has(entry.name) || (dir === root && SKIPPED_AT_ROOT.has(entry.name));
      if (!skipped) collectSourceFiles(root, abs, out);
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name)) || TEST_FILE.test(entry.name)) continue;
    if (fs.statSync(abs).size > MAX_FILE_BYTES) continue;
    const rel = toPosix(path.relative(root, abs));
    out.push({ path: rel, text: fs.readFileSync(abs, "utf8"), side: isServerPath(rel) ? "server" : "app" });
  }
  return out;
}

function readRootFiles(root, names) {
  return names
    .filter((name) => fs.existsSync(path.join(root, name)))
    .map((name) => ({ path: name, text: fs.readFileSync(path.join(root, name), "utf8") }));
}

export class NotReactNativeProject extends Error {}

export function loadProject(dir) {
  const root = path.resolve(dir);
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) throw new NotReactNativeProject(`No package.json in ${root}.`);
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (error) {
    throw new NotReactNativeProject(`Could not parse ${pkgPath}: ${error.message}`);
  }
  const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  if (!deps.has("react-native") && !deps.has("expo")) {
    throw new NotReactNativeProject(`${root} has no react-native or expo dependency, so it is not an Expo / React Native app.`);
  }
  const envNames = fs.readdirSync(root).filter((name) => name === ".env" || name.startsWith(".env."));
  return {
    root,
    pkg,
    deps,
    configFiles: readRootFiles(root, CONFIG_FILE_NAMES),
    sourceFiles: collectSourceFiles(root, root, []),
    envFiles: readRootFiles(root, envNames),
  };
}

function hasDep(project, names) {
  return names.some((name) =>
    name.endsWith("/*") ? [...project.deps].some((dep) => dep.startsWith(name.slice(0, -1))) : project.deps.has(name),
  );
}

export function maskSecrets(text) {
  return text.replace(SECRET_LITERAL, (secret) => `${secret.slice(0, 4)}****`);
}

function maskEnvValue(line) {
  return line.replace(/=\s*(['"]?)(.{0,4})[^'"\s]*\1/, (_, quote, head) => `=${quote}${head}****${quote}`);
}

function finding(file, index, line) {
  const text = maskSecrets(line.trim());
  return { file: file.path, line: index + 1, text: text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}…` : text };
}

function grep(files, pattern, { skipLine } = {}) {
  const out = [];
  for (const file of files) {
    file.text.split("\n").forEach((line, i) => {
      if (pattern.test(line) && !skipLine?.(line)) out.push(finding(file, i, line));
    });
  }
  return out;
}

function firstMatch(file, pattern) {
  const lines = file.text.split("\n");
  const i = lines.findIndex((line) => pattern.test(line));
  return finding(file, Math.max(i, 0), lines[Math.max(i, 0)]);
}

const appFiles = (project) => project.sourceFiles.filter((f) => f.side === "app");
const serverFiles = (project) => project.sourceFiles.filter((f) => f.side === "server");
const notApplicable = (summary) => ({ status: "n/a", summary, findings: [] });

function aiReferences(files) {
  return grep(files, AI_IMPORT).concat(grep(files, AI_HOST));
}

function usesAi(project) {
  return hasDep(project, AI_DEPS) || aiReferences(project.sourceFiles).length > 0;
}

function checkAccountDeletion(project) {
  const signUp = /\bsignUp\b|signInWith|createUserWithEmailAndPassword|\bsignIn\(|useSignUp|useOAuth|promptAsync|GoogleSignin\.signIn/;
  const accountCreation = hasDep(project, AUTH_DEPS) ? grep(appFiles(project), signUp) : [];
  if (accountCreation.length === 0) return notApplicable("No account creation found.");
  const deletion = grep(project.sourceFiles, /delete[\s_-]?account|deleteUser|delete_user|deleteAccount|account[\s_-]?deletion|admin\.deleteUser/i);
  if (deletion.length > 0) {
    return { status: "pass", summary: "Account creation found, and code that deletes accounts. Confirm the user can reach it from inside the app.", findings: deletion };
  }
  return { status: "fail", summary: "The app creates accounts but no account-deletion code was found.", findings: accountCreation };
}

function checkSignInWithApple(project) {
  const social = /provider:\s*['"](?:google|facebook|twitter|x|linkedin|github|discord)['"]|GoogleSignin|oauth_(?:google|facebook|twitter|x|linkedin|github|discord|microsoft)/;
  const socialDeps = ["@react-native-google-signin/google-signin", "react-native-fbsdk-next"];
  const socialLogin = grep(appFiles(project), social);
  if (!hasDep(project, socialDeps) && socialLogin.length === 0) return notApplicable("No third-party or social login found.");
  const apple = grep(appFiles(project), /provider:\s*['"]apple['"]|oauth_apple|AppleAuthentication/);
  if (hasDep(project, ["expo-apple-authentication", "@invertase/react-native-apple-authentication"]) || apple.length > 0) {
    return { status: "pass", summary: "Social login is offered alongside Sign in with Apple.", findings: apple };
  }
  return {
    status: "fail",
    summary:
      "Social login is offered without Sign in with Apple. 4.8 has exceptions: the app uses only the company's own account system, it is an education or enterprise app using existing accounts, or it is a client for a specific third-party service whose account the user signs in to.",
    findings: socialLogin,
  };
}

function checkRestorePurchases(project) {
  if (!hasDep(project, IAP_DEPS)) return notApplicable("No in-app purchase SDK found.");
  const restore = grep(appFiles(project), /restorePurchases|restoreTransactions|restorePurchase\b|getAvailablePurchases|restore\(/);
  if (restore.length > 0) return { status: "pass", summary: "A restore call exists. Confirm a button reaches it.", findings: restore };
  if (!hasDep(project, IAP_DEPS.filter((dep) => !REMOTE_PAYWALL_DEPS.includes(dep)))) {
    return { status: "warn", summary: "No restore call in code. Remote paywalls usually include restore; confirm it is enabled in the paywall editor.", findings: [] };
  }
  return { status: "fail", summary: "In-app purchases are sold but nothing in the code restores them.", findings: [] };
}

function checkSubscriptionDisclosure(project) {
  if (!hasDep(project, IAP_DEPS)) return notApplicable("No in-app purchase SDK found.");
  const paywallName = /paywall|subscribe|subscription|upgrade|premium|pricing|\bpro\b/i;
  const paywallComponent = /(?:function|const|class)\s+\w*(?:Paywall|Subscribe|Subscription|Upgrade|Premium|Pricing)\w*/;
  const screens = appFiles(project).filter((f) => /\.[jt]sx$/.test(f.path));
  const paywalls = screens.filter((f) => paywallName.test(f.path) || paywallComponent.test(f.text));
  const disclosed = paywalls.filter((f) => /terms/i.test(f.text) && /privacy/i.test(f.text));
  if (disclosed.length > 0) {
    return {
      status: "pass",
      summary: "A paywall screen links to Terms and Privacy. Confirm it also shows price, billing period and what is included.",
      findings: disclosed.flatMap((f) => [firstMatch(f, /terms/i), firstMatch(f, /privacy/i)]),
    };
  }
  if (paywalls.length > 0) {
    return {
      status: "warn",
      summary: "Confirm each paywall shows the price, billing period, what is included, and links to Terms of Use and the Privacy Policy.",
      findings: paywalls.map((f) => finding(f, 0, f.text.split("\n")[0])),
    };
  }
  if (hasDep(project, REMOTE_PAYWALL_DEPS)) {
    return { status: "warn", summary: "The paywall is remote; check it in the dashboard for price, billing period, what is included, and Terms and Privacy links.", findings: [] };
  }
  return { status: "warn", summary: "No paywall screen found in code. Find where subscriptions are sold and confirm price, billing period, contents, and Terms and Privacy links.", findings: [] };
}

function checkAiConsent(project) {
  if (!usesAi(project)) return notApplicable("No third-party AI usage found.");
  const app = appFiles(project);
  const consent = [
    ...app.filter((f) => /consent/i.test(f.path)).map((f) => finding(f, 0, f.text.split("\n")[0])),
    ...app.filter((f) => !/consent/i.test(f.path) && /consent/i.test(f.text) && aiReferences([f]).length > 0).map((f) => firstMatch(f, /consent/i)),
  ];
  if (consent.length > 0) {
    return { status: "pass", summary: "Consent code exists. Confirm it names the AI provider, says what data is sent, and runs before the first request.", findings: consent };
  }
  return { status: "fail", summary: "Data goes to a third-party AI but no consent prompt was found in the app.", findings: aiReferences(project.sourceFiles) };
}

function checkExposedAiKey(project) {
  if (!usesAi(project)) return notApplicable("No AI usage found.");
  const app = appFiles(project);
  const exposed = [
    ...grep(app, AI_KEY_ENV),
    ...grep(project.envFiles, AI_KEY_ENV).map((f) => ({ ...f, text: maskEnvValue(f.text) })),
    ...grep(app, new RegExp(SECRET_LITERAL.source)),
    ...grep(app, AI_CLIENT),
  ];
  if (exposed.length > 0) return { status: "fail", summary: "An AI key or AI client is in app code, so it ships in the bundle.", findings: exposed };
  const appSide = aiReferences(app);
  if (appSide.length === 0) return { status: "pass", summary: "AI is called only from server code.", findings: [] };
  return { status: "pass", summary: "App code references AI, but no key or client construction was found. Confirm these requests go through your server.", findings: appSide };
}

function readPurposeString(configFiles, name) {
  const pattern = new RegExp(`["']?\\b${name}["']?\\s*:\\s*(false\\b|"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|\`([^\`]*)\`)?`);
  for (const file of configFiles) {
    const match = pattern.exec(file.text);
    if (!match) continue;
    const index = file.text.slice(0, match.index).split("\n").length - 1;
    const value = match[2] ?? match[3] ?? match[4];
    return { disabled: match[1] === "false", value, at: finding(file, index, file.text.split("\n")[index]) };
  }
  return null;
}

function checkPurposeStrings(project) {
  const required = new Map();
  for (const [dep, entries] of Object.entries(PURPOSE_STRINGS)) {
    if (!project.deps.has(dep)) continue;
    for (const [plistKey, option] of entries) {
      const entry = required.get(plistKey) ?? { options: new Set(), deps: new Set() };
      entry.options.add(option);
      entry.deps.add(dep);
      required.set(plistKey, entry);
    }
  }
  if (required.size === 0) return notApplicable("No dependency that needs a purpose string.");
  const configPath = project.configFiles[0]?.path ?? "app.json";
  const findings = [];
  for (const [plistKey, { options, deps }] of required) {
    const found = [plistKey, ...options].map((name) => readPurposeString(project.configFiles, name)).find(Boolean);
    if (found?.disabled) continue;
    if (!found) {
      findings.push({ file: configPath, line: 1, text: `missing ${plistKey} (${[...deps].join(", ")}: ${[...options].join(" / ")})` });
      continue;
    }
    if (found.value !== undefined && (EXPO_DEFAULT_PURPOSE.test(found.value) || found.value.length < MIN_PURPOSE_CHARS)) {
      findings.push(found.at);
    }
  }
  if (findings.length === 0) return { status: "pass", summary: "Every purpose string is set and specific.", findings: [] };
  return {
    status: "warn",
    summary: "Missing or generic purpose strings. When one is missing Expo inserts its default, like 'Allow $(PRODUCT_NAME) to access your camera', which doesn't say why.",
    findings,
  };
}

function checkPlaceholderContent(project) {
  const app = appFiles(project);
  const findings = [
    ...grep(app, /lorem ipsum/i),
    ...grep(app, /https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0)/, { skipLine: (line) => /__DEV__|process\.env/.test(line) }),
    ...grep(app, /example\.com/),
  ];
  if (findings.length === 0) return { status: "pass", summary: "No placeholder text or local URLs found.", findings: [] };
  return { status: "warn", summary: "Placeholder text or development URLs in app code.", findings };
}

export const CHECKS = [
  {
    id: "account-deletion",
    title: "Account deletion in the app",
    guideline: "5.1.1(v)",
    kind: "review",
    fix: "Add a delete-account action the user can reach in the app (usually in settings or profile) that deletes the account and its data server-side, not just signs out.",
    nativeexpress: "Account deletion is built in, on the profile screen, backed by an edge function.",
    run: checkAccountDeletion,
  },
  {
    id: "sign-in-with-apple",
    title: "Sign in with Apple next to social login",
    guideline: "4.8",
    kind: "review",
    fix: "Add Sign in with Apple (expo-apple-authentication) with equal prominence to the other social logins, unless one of the 4.8 exceptions applies.",
    nativeexpress: "Sign in with Apple ships next to Google and email.",
    run: checkSignInWithApple,
  },
  {
    id: "restore-purchases",
    title: "Restore purchases",
    guideline: "3.1.1",
    kind: "review",
    fix: "Add a visible Restore Purchases button (usually on the paywall and in settings) that calls the SDK's restore method and reports the result.",
    nativeexpress: "RevenueCat and Superwall are wired, restore included.",
    run: checkRestorePurchases,
  },
  {
    id: "subscription-disclosure",
    title: "Subscription terms on the paywall",
    guideline: "3.1.2(c)",
    kind: "review",
    fix: "Show price, billing period and what the subscription includes before the purchase button, and link to Terms of Use (EULA) and the Privacy Policy.",
    nativeexpress: null,
    run: checkSubscriptionDisclosure,
  },
  {
    id: "ai-consent",
    title: "Consent before sharing data with AI",
    guideline: "5.1.2(i)",
    kind: "review",
    fix: "Before the first AI request, show a prompt that names the AI provider and the data sent, and store the user's explicit opt-in. Don't send anything until they accept.",
    nativeexpress: null,
    run: checkAiConsent,
  },
  {
    id: "exposed-ai-key",
    title: "AI key in the app bundle",
    guideline: "Not an App Review rule — anything in the app bundle can be extracted",
    kind: "security",
    fix: "Move the AI call to a server function (for example a Supabase edge function or an Expo API route), keep the key there as a secret, and rotate the exposed key.",
    nativeexpress: "AI calls go through Supabase edge functions; no key ships in the app.",
    run: checkExposedAiKey,
  },
  {
    id: "purpose-strings",
    title: "Permission purpose strings",
    guideline: "5.1.1(ii)",
    kind: "review",
    fix: "Set each permission string in the plugin's options in app.json / app.config, saying what the app does with the data, for example \"Used to scan receipts so you can track expenses\".",
    nativeexpress: null,
    run: checkPurposeStrings,
  },
  {
    id: "placeholder-content",
    title: "Placeholder content",
    guideline: "2.1(a)",
    kind: "review",
    fix: "Replace placeholder text and example URLs with real content, and point local URLs at production (or gate them behind __DEV__).",
    nativeexpress: null,
    run: checkPlaceholderContent,
  },
];

function mentionsNativeExpress(project) {
  const texts = [JSON.stringify(project.pkg), ...project.configFiles.map((f) => f.text)];
  const configJs = path.join(project.root, "config.js");
  if (fs.existsSync(configJs)) texts.push(fs.readFileSync(configJs, "utf8"));
  return texts.some((text) => /nativeexpress/i.test(text));
}

export function scan(dir) {
  const project = loadProject(dir);
  const results = CHECKS.map(({ run, ...check }) => {
    const { status, summary, findings } = run(project);
    return { id: check.id, title: check.title, guideline: check.guideline, kind: check.kind, status, summary, findings: findings.slice(0, MAX_FINDINGS), fix: check.fix, nativeexpress: check.nativeexpress };
  });
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, results.filter((r) => r.status === status).length]));
  return { root: project.root, isExpo: project.deps.has("expo"), isNativeExpress: mentionsNativeExpress(project), results, counts };
}

const FINDINGS_SHOWN = 5;

export function formatReport(report) {
  const tags = [report.isExpo ? "Expo" : "React Native", report.isNativeExpress ? "NativeExpress" : null].filter(Boolean);
  const lines = [`App Store check: ${report.root} (${tags.join(", ")})`, ""];
  for (const status of STATUS_ORDER) {
    for (const r of report.results.filter((result) => result.status === status)) {
      lines.push(`${status.toUpperCase().padEnd(4)}  ${r.id}  [${r.guideline}]  ${r.title}`, `      ${r.summary}`);
      if (status === "n/a") continue;
      for (const f of r.findings.slice(0, FINDINGS_SHOWN)) lines.push(`      ${f.file}:${f.line}  ${f.text}`);
      if (r.findings.length > FINDINGS_SHOWN) lines.push(`      … ${r.findings.length - FINDINGS_SHOWN} more (--json for all)`);
      if (status === "fail" || status === "warn") lines.push(`      fix: ${r.fix}`);
    }
  }
  const { counts } = report;
  lines.push("", `${counts.fail} fail, ${counts.warn} warn, ${counts.pass} pass, ${counts["n/a"]} n/a. This is a heuristic scan; read the flagged files before acting.`);
  return lines.join("\n");
}

function main(argv) {
  const json = argv.includes("--json");
  const dir = argv.find((arg) => !arg.startsWith("--")) ?? process.cwd();
  let report;
  try {
    report = scan(dir);
  } catch (error) {
    if (!(error instanceof NotReactNativeProject)) throw error;
    console.error(error.message);
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.counts.fail > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
