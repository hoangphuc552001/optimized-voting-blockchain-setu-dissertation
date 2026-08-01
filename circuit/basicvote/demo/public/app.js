/* ZKER demo — voter device.
 *
 * Everything in this file runs in the browser. Layer 1 proof generation uses
 * snarkjs' WASM prover against VoteProof.wasm / VoteProof.zkey served by the
 * demo server; the witness — which contains the voter's secret — is built here
 * and destroyed here. The server only ever receives {proof, publicSignals}.
 */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const S = {
  election: null,
  voterIndex: 0,
  candidate: 0,
  creds: null,
  lastProof: null,
  proving: false,
  view: "voter"
};

// ------------------------------------------------------------------- helpers

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

const short = (x, head = 10, tail = 4) => {
  const s = String(x);
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
};

const randomField = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return (n % FIELD).toString();
};

function term(el, lines, append = false) {
  const node = $(el);
  const html = (Array.isArray(lines) ? lines : [lines]).join("\n");
  node.innerHTML = append ? node.innerHTML + "\n" + html : html;
  node.scrollTop = node.scrollHeight;
}

const c = {
  g: s => `<span class="g">${s}</span>`,
  r: s => `<span class="r">${s}</span>`,
  y: s => `<span class="y">${s}</span>`,
  b: s => `<span class="b">${s}</span>`,
  d: s => `<span class="d">${s}</span>`
};

/** An Etherscan link, or nothing at all when running against a local node. */
const escan = (url, text = "Etherscan", cls = "") =>
  url ? `<a class="escan ${cls}" href="${url}" target="_blank" rel="noopener">${text}</a>` : "";

// ------------------------------------------------------------------- router

const VIEWS = {
  voter:    { title: "Voter Terminal",   cta: "Generate Proof",  action: () => proveAndSend() },
  operator: { title: "Operator Console", cta: "Assemble Batch",  action: () => submitBatch() },
  mempool:  { title: "Mempool",          cta: "Assemble Batch",  action: () => submitBatch() },
  ledger:   { title: "Ledger · L1",      cta: "Verify Latest",   action: () => observe() },
  explorer: { title: "Block Explorer",   cta: "Refresh",         action: () => loadExplorer() },
  attack:   { title: "Attack Panel",     cta: "Generate Proof",  action: () => { show("voter"); proveAndSend(); } }
};

/**
 * Switch views. The three trust domains now live on separate pages rather than
 * side by side, so the top bar and the defence ladder stay pinned — they are
 * what let an audience follow state crossing a boundary they cannot see at once.
 */
function show(name) {
  if (!VIEWS[name]) return;
  S.view = name;

  $$(".view").forEach(v => v.classList.toggle("on", v.id === `view-${name}`));
  $$(".navlink").forEach(b => b.classList.toggle("on", b.dataset.view === name));

  $("#view-title").textContent = VIEWS[name].title;
  $("#nav-cta-label").textContent = VIEWS[name].cta;

  if (name === "explorer") loadExplorer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------------ overlay

function overlay({ title, lede, rows = [], fail = false, closeLabel = "Return to terminal" }) {
  $("#overlay").classList.toggle("fail", fail);
  $("#overlay-title").textContent = title;
  $("#overlay-lede").textContent = lede || "";
  $("#overlay-icon").innerHTML = fail
    ? `<svg class="i lg" viewBox="0 0 24 24"><path d="M15 9l-6 6M9 9l6 6"/><circle cx="12" cy="12" r="9"/></svg>`
    : `<svg class="i lg" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`;
  $("#overlay-data").innerHTML = rows.map(r =>
    `<div><div class="k">${r.k}</div><div class="v ${r.dim ? "dim" : ""}">${r.v}</div></div>`).join("");
  $("#overlay-close").textContent = closeLabel;
  $("#overlay").classList.add("on");
}

const closeOverlay = () => $("#overlay").classList.remove("on");

/** Light up the rung of the defence ladder where the last event was stopped. */
function ladder(rung, caption) {
  $$(".rung").forEach(r => r.classList.toggle("hit", r.dataset.rung === rung));
  if (caption) $("#ladder-caption").textContent = caption;
}

function logLine(msg, cls = "") {
  const el = $("#eventlog");
  const t = new Date().toLocaleTimeString();
  el.innerHTML += `${c.d(t)}  ${cls ? c[cls](msg) : msg}\n`;
  el.scrollTop = el.scrollHeight;
}

// --------------------------------------------------------------- bootstrap

async function boot() {
  const { data } = await api("/api/election");
  S.election = data;

  $("#pill-election").innerHTML = `election <b>${data.electionId}</b>`;
  $("#pill-root").innerHTML = `root <b>${short(data.voterMerkleRoot, 6, 4)}</b>`;
  $("#pill-chain").innerHTML = ``;
  $("#m-constraints").textContent = data.circuits.voteProof.constraints.toLocaleString();
  $("#voter-count").textContent = `${data.voters.length} registered`;

  const net = $("#pill-net");
  net.className = `livepill ${data.network}`;
  net.innerHTML = `<span class="dot live"></span><span>${
    data.network === "sepolia" ? "Sepolia · public testnet" : `local · chain ${data.chainId}`}</span>`;
  net.title = data.network === "sepolia"
    ? `Operator ${data.operatorAddress} · every transaction has a real Etherscan page`
    : "Transactions are local only; switch with DEMO_NETWORK=sepolia";

  $("#contract-links").innerHTML = Object.entries(data.addresses).map(([k, addr]) => `
    <div class="row">
      <span>${k}</span>
      <span class="v">${short(addr, 8, 6)}</span>
      ${escan(data.addressUrls[k])}
    </div>`).join("");

  // Identity cards, mirroring the mockup — plus the select, which stays because
  // it is far quicker to drive from a keyboard mid-demo.
  $("#sel-voter-list").innerHTML = data.voters.map(v => `
    <div class="iditem" data-index="${v.index}">
      <div class="who">
        <div class="nm">${v.name}</div>
        <div class="hs">commitment ${short(v.commitment, 10, 6)}</div>
      </div>
      <span class="mk">
        <svg class="i sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path class="tickpath" d="M9 12l2 2 4-4"/></svg>
      </span>
    </div>`).join("");

  $$("#sel-voter-list .iditem").forEach(el => el.addEventListener("click", () => {
    S.voterIndex = Number(el.dataset.index);
    markVoter();
    loadCredentials(S.voterIndex);
  }));



  $("#candidates").innerHTML = data.candidates
    .map(cd => `<button class="cand" data-id="${cd.id}">
        <span class="av">${cd.id}</span>
        <span>
          <span class="nm">${cd.name}</span>
        </span>
        <span class="tick"><svg class="i sm" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg></span>
      </button>`)
    .join("");

  $$(".cand").forEach(el => el.addEventListener("click", () => {
    S.candidate = Number(el.dataset.id);
    $$(".cand").forEach(x => x.classList.toggle("on", x === el));
    renderVoter();
  }));
  $$(".cand")[0].classList.add("on");
  markVoter();

  await loadCredentials(0);
  await refresh();
  await loadExplorer();
  await loadSepoliaReference();
  term("#voter-term", [
    c.d("Layer 1 prover ready (snarkjs WASM, in this tab)."),
    c.d(`VoteProof: ${data.circuits.voteProof.constraints.toLocaleString()} constraints, ` +
        `${data.circuits.voteProof.privateInputs} private / ${data.circuits.voteProof.publicInputs} public inputs.`)
  ]);
  logLine("Demo ready. Contracts deployed, prover loaded.", "g");
}

async function loadCredentials(index) {
  const attack = $("#sel-attack").value;
  if (attack === "forged-registry") {
    const { data } = await api("/api/attack/forged-registry");
    S.creds = data;
  } else {
    const { data } = await api(`/api/voter/${index}/credentials`);
    S.creds = data;
  }
  renderVoter();
}

/** Highlight the selected identity card. */
function markVoter() {
  $$("#sel-voter-list .iditem").forEach(el =>
    el.classList.toggle("on", Number(el.dataset.index) === S.voterIndex));
}

function renderVoter() {
  if (!S.creds) return;
  const attack = $("#sel-attack").value;

  $("#pv-secret").textContent = short(S.creds.voterSecret, 18, 6);
  $("#pv-path").textContent = `${S.creds.pathElements.length} sibling hashes (hidden)`;

  const view = ballotView(attack);
  $("#pb-null").textContent = short(view.nullifierHash, 18, 6);
  $("#pb-cand").textContent = view.candidate;
  $("#pb-vote").textContent = view.vote;
  $("#pb-root").textContent = short(view.voterMerkleRoot, 14, 6);
  $("#pb-eid").textContent = view.electionId;

  const bad = attack !== "none";
  $("#pb-cand").style.color = attack === "out-of-range-candidate" ? "var(--danger)" : "";
  $("#pb-vote").style.color = attack === "non-binary-vote" ? "var(--danger)" : "";
  $("#pb-eid").style.color = attack === "wrong-election-id" ? "var(--danger)" : "";
  $("#pb-root").style.color = attack === "forged-registry" ? "var(--danger)" : "";
  $("#pb-null").style.color = attack === "forged-nullifier" ? "var(--danger)" : "";

  const label = $("#sel-attack").selectedOptions[0].textContent;
  $("#ballot-fault").textContent = bad ? `fault: ${label}` : "honest ballot";
  $("#ballot-fault").className = `chip spacer ${bad ? "error" : ""}`;
  $("#nav-fault").textContent = bad ? "armed" : "off";
  $("#nav-fault").className = `badge ${bad ? "hot" : ""}`;
  $("#attack-hint").textContent = bad
    ? `Armed. Cast a ballot on the Voter Terminal — this one should die at ${expectedRung(attack)}.`
    : "Pick a fault, then go to the Voter Terminal and cast a ballot.";

  $("#btn-prove").textContent = bad ? "Attempt proof with injected fault" : "Generate & submit proof";
}

/** Where each voter-side fault is expected to be stopped — used for the hint text. */
function expectedRung(attack) {
  if (["non-binary-vote", "out-of-range-candidate", "ineligible-voter", "forged-nullifier"].includes(attack)) {
    return "L0, in the circuit";
  }
  if (["tamper-proof", "tamper-signal", "double-vote"].includes(attack)) {
    return "L1 at the operator (or later, if the operator is complicit)";
  }
  return "L3, at Ethereum — if the operator forwards it";
}

/** The public half of the ballot, with whatever fault is selected applied. */
function ballotView(attack) {
  const v = {
    nullifierHash: S.creds.nullifierHash,
    candidate: String(S.candidate),
    vote: "1",
    voterMerkleRoot: S.creds.voterMerkleRoot,
    electionId: S.creds.electionId
  };
  if (attack === "non-binary-vote") v.vote = "2";
  if (attack === "out-of-range-candidate") v.candidate = "7";
  if (attack === "forged-nullifier") v.nullifierHash = randomField();
  if (attack === "wrong-election-id") {
    v.electionId = S.creds.altElectionId;
    v.nullifierHash = S.creds.altNullifierHash;
  }
  return v;
}

// ------------------------------------------------------------------ proving

async function proveAndSend() {
  if (S.proving) return;
  const attack = $("#sel-attack").value;
  const malicious = $("#chk-malicious-op").checked;

  S.proving = true;
  $("#btn-prove").classList.add("busy", "pulsing");
  $("#m-provetime").textContent = "…";
  $("#m-proofsize").textContent = "—";
  proofStage("building witness locally", true);

  const view = ballotView(attack);

  // The witness. This object exists only in this tab.
  const input = {
    voterSecret: S.creds.voterSecret,
    voterPathElements: S.creds.pathElements,
    voterPathIndices: S.creds.pathIndices,
    nullifierHash: view.nullifierHash,
    candidate: view.candidate,
    vote: view.vote,
    voterMerkleRoot: view.voterMerkleRoot,
    electionId: view.electionId
  };

  if (attack === "ineligible-voter") {
    input.voterSecret = randomField();
    term("#voter-term", [c.y("Fault: voting with a secret that was never registered."),
      c.d("Merkle path kept from a real voter — the computed root will not match.")]);
  }

  if (attack === "wrong-election-id") {
    // The nullifier must stay consistent with the tampered electionId, or the
    // circuit stops this at L0 and it never reaches the chain — which would
    // demonstrate the wrong thing. Both nullifiers were provisioned with the
    // rest of this device's credentials; no secret goes back to the server.
    input.nullifierHash = view.nullifierHash = S.creds.altNullifierHash;
    input.electionId = view.electionId = S.creds.altElectionId;
    $("#pb-null").textContent = short(input.nullifierHash, 18, 6);
  }

  term("#voter-term", [
    c.b("→ building witness locally…"),
    c.d(`   private: voterSecret + ${S.creds.pathElements.length} path elements`),
    c.d(`   public : nullifier, candidate=${view.candidate}, vote=${view.vote}`),
    c.b("→ groth16.fullProve (6,179 constraints)…")
  ]);

  let proof, publicSignals, ms;
  try {
    proofStage("groth16.fullProve — 6,179 constraints", true);
    const t0 = performance.now();
    const out = await snarkjs.groth16.fullProve(input, "/zk/VoteProof.wasm", "/zk/VoteProof.zkey");
    ms = performance.now() - t0;
    proof = out.proof;
    publicSignals = out.publicSignals;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    term("#voter-term", [
      "",
      c.r("✗ WITNESS GENERATION FAILED"),
      c.d("  " + msg.split("\n").slice(0, 3).join("\n  ")),
      "",
      c.y("Nothing was sent. No proof exists, because the statement is false."),
      c.d("The circuit did not 'reject' the ballot — it could not represent it.")
    ], true);
    ladder("L0", "Stopped at L0: the constraint system has no satisfying witness. Nothing reached the operator.");
    logLine(`Fault "${attack}" stopped at L0 (witness generation)`, "r");
    finishProving();
    overlay({
      fail: true,
      title: "No proof exists",
      lede: "Witness generation failed. The circuit did not reject the ballot — it could not represent it.",
      rows: [
        { k: "Injected fault", v: $("#sel-attack").selectedOptions[0].textContent },
        { k: "Circuit error", v: msg.split("\n").slice(0, 2).join(" ").slice(0, 240), dim: true },
        { k: "Sent to the operator", v: "nothing" }
      ],
      closeLabel: "Understood"
    });
    return;
  }

  const bytes = new Blob([JSON.stringify(proof)]).size;
  $("#m-provetime").textContent = `${(ms / 1000).toFixed(2)} s`;
  $("#m-proofsize").textContent = "256 B";

  term("#voter-term", [
    "",
    c.g(`✓ proof generated in ${(ms / 1000).toFixed(2)} s`),
    c.d(`  8 field elements · 256 bytes on the wire (${bytes} B as JSON)`),
    c.d(`  pi_a[0] = ${short(proof.pi_a[0], 22, 6)}`)
  ], true);

  // --- post-proof tampering ------------------------------------------------
  if (attack === "tamper-proof") {
    proof = JSON.parse(JSON.stringify(proof));
    proof.pi_a[0] = ((BigInt(proof.pi_a[0]) + 1n) % FIELD).toString();
    term("#voter-term", [c.y("Fault: incremented pi_a[0] by 1 after proving.")], true);
  }
  if (attack === "tamper-signal") {
    publicSignals = [...publicSignals];
    const before = publicSignals[1];
    publicSignals[1] = String((Number(before) + 1) % 5);
    term("#voter-term", [c.y(`Fault: swapped the public candidate signal ${before} → ${publicSignals[1]}, proof untouched.`)], true);
  }

  S.lastProof = { proof, publicSignals };

  // --- send to the operator ------------------------------------------------
  term("#voter-term", [c.b("→ sending {proof, publicSignals} to the operator…")], true);
  proofStage("broadcasting nullifier to the operator", true);

  const { ok, data } = await api("/api/vote", {
    method: "POST",
    body: { proof, publicSignals, label: attack === "none" ? S.creds.name : `${S.creds.name} · ${attack}`, maliciousOperator: malicious }
  });

  renderChecks(data.checks || []);

  const proofRows = [
    { k: "Generated nullifier", v: publicSignals[0] },
    { k: "Groth16 proof (A, B, C)", v: `[${[proof.pi_a[0], proof.pi_a[1], proof.pi_b[0][0], proof.pi_b[0][1],
        proof.pi_b[1][0], proof.pi_b[1][1], proof.pi_c[0], proof.pi_c[1]]
        .map(x => short(x, 7, 4)).join(", ")}]`, dim: true },
    { k: "Proving time", v: `${(ms / 1000).toFixed(2)} s · 256 bytes on the wire` }
  ];

  if (!ok) {
    term("#voter-term", [c.r(`✗ operator rejected: ${data.failedAt}`)], true);
    ladder("L1", `Stopped at L1: the operator's admission check "${data.failedAt}" failed. The proof was real but the claim was not.`);
    logLine(`Fault "${attack}" stopped at L1 (operator: ${data.failedAt})`, "r");
    overlay({
      fail: true,
      title: "Rejected by the operator",
      lede: `The proof itself was well-formed, but the claim behind it did not hold. Failed check: ${data.failedAt}.`,
      rows: proofRows,
      closeLabel: "Understood"
    });
  } else if (data.forwardedDespiteFailure) {
    term("#voter-term", [c.y(`~ operator forwarded it anyway (failed: ${data.failedAt})`)], true);
    ladder(null, `A complicit operator accepted a ballot that failed "${data.failedAt}". Submit the batch and see whether Ethereum agrees.`);
    logLine(`Malicious operator forwarded a ballot failing "${data.failedAt}"`, "y");
    overlay({
      title: "Forwarded by a complicit operator",
      lede: `The operator saw this ballot fail "${data.failedAt}" and queued it anyway. Assemble a batch to find out whether Ethereum agrees.`,
      rows: proofRows,
      closeLabel: "Go to Operator Console"
    });
    $("#overlay-close").dataset.goto = "operator";
  } else {
    term("#voter-term", [c.g(`✓ accepted — mempool ${data.mempoolSize}/${S.election.batchSize}`)], true);
    ladder(null, "An attack dies at the lowest rung that can catch it. The lower it dies, the stronger the guarantee.");
    logLine(`Vote accepted — mempool ${data.mempoolSize}/${S.election.batchSize}`, "g");
    overlay({
      title: "Ballot accepted",
      lede: `Verified by the operator and queued. Mempool is now ${data.mempoolSize} of ${S.election.batchSize}. Your identity was never transmitted.`,
      rows: proofRows
    });
  }

  finishProving();
  await refresh();
}

function finishProving() {
  S.proving = false;
  $("#btn-prove").classList.remove("busy", "pulsing");
  proofStage(null);
}

/**
 * Proof progress. The bar is deliberately indeterminate: real proving here takes
 * about 0.3 s and snarkjs reports no fractional progress, so a percentage would
 * be invented. The stage label is real.
 */
function proofStage(text, running = false) {
  const box = $("#proof-container");
  if (!text) { box.style.display = "none"; return; }
  box.style.display = "";
  $("#proof-stage").textContent = text.toUpperCase();
  $("#proof-percent").textContent = running ? "working…" : "";
  $("#proof-track").classList.toggle("indet", running);
  $("#proof-progress").style.width = running ? "" : "100%";
}

function renderChecks(checks) {
  const el = $("#check-list");
  if (!checks.length) { el.innerHTML = '<li class="muted">no submission yet</li>'; return; }
  el.innerHTML = checks.map(ck => `
    <li>
      <span class="mark ${ck.passed ? "ok" : "bad"}">${ck.passed ? "✓" : "✗"}</span>
      <span><span class="ckname">${ck.name}</span><br><span class="ckdetail">${ck.detail}</span></span>
    </li>`).join("");
}

// ------------------------------------------------------------------ batching

async function submitBatch() {
  const attacks = {};
  if ($("#op-censor").checked)  attacks.censorIndex = Number($("#op-censor-idx").value);
  if ($("#op-swap").checked)    attacks.swapCandidate = { index: Number($("#op-swap-idx").value), to: Number($("#op-swap-to").value) };
  if ($("#op-inflate").checked) attacks.inflateTally = { extra: 1 };
  if ($("#op-tamper").checked)  attacks.tamperProof = true;

  const onSepolia = S.election.network === "sepolia";

  $("#btn-batch").classList.add("busy", "pulsing");
  $("#m-batchtime").textContent = "…";
  term("#op-term", [
    c.b("→ assembling batch and proving (100,116 constraints)…"),
    c.d("   this takes ~2 s — the honest cost of aggregation")
  ]);
  if (onSepolia) {
    term("#chain-term", [
      c.y("waiting for Sepolia…"),
      c.d("proof generation, then broadcast, then one block (~12 s) to confirm")
    ]);
  }

  const { data } = await api("/api/batch", { method: "POST", body: { attacks } });

  $("#btn-batch").classList.remove("busy", "pulsing");

  if (data.error) {
    term("#op-term", [c.r("✗ " + data.error)]);
    return;
  }

  const lines = (data.steps || []).map(s => {
    const glyph = { ok: c.g("✓"), attack: c.y("⚑"), note: c.d("·"), blocked: c.r("✗"), rejected: c.r("✗"), failed: c.r("✗") }[s.status] || "·";
    return `${glyph} ${s.name}\n  ${c.d(s.detail)}`;
  });

  const proveStep = (data.steps || []).find(s => s.proveMs);
  if (proveStep) {
    $("#m-batchtime").textContent = `${(proveStep.proveMs / 1000).toFixed(2)} s`;
    $("#m-batchsize").textContent = "256 B";
  }

  if (data.ok) {
    const b = data.batch;
    lines.push("", c.g(`✓ batch ${b.index} settled on Ethereum`));
    term("#op-term", lines);
    term("#chain-term", [
      c.g(`tx ${b.txHash}`),
      c.d(`block ${b.blockNumber} · ${b.gasUsed.toLocaleString()} gas · ${b.voteCount} vote(s) + ${b.padded} no-op padding`),
      c.d(`root ${short(b.preStateRoot, 12, 6)} → ${short(b.postStateRoot, 12, 6)}`),
      c.b(`${b.gasPerVote.toLocaleString()} gas per vote`),
      b.txUrl ? c.g(`etherscan: ${b.txUrl}`) : ""
    ].filter(Boolean));
    logLine(`Batch ${b.index} accepted — ${b.gasUsed.toLocaleString()} gas (${b.gasPerVote.toLocaleString()}/vote)`, "g");
    loadExplorer(b.txHash);   // jump the explorer straight to the batch just settled

    if (b.attacks.includes("censorIndex")) {
      ladder("NONE", "The censored vote is simply absent and the proof is still valid. Integrity holds; liveness does not. This is the forced-inclusion gap.");
      logLine("Censorship was NOT caught — see Design Challenges", "r");
    } else if (b.attacks.includes("swapCandidate")) {
      ladder("NONE", "The batch circuit constrains the nullifier set but does not bind ballots to their Layer-1 proofs, so a re-routed ballot still proves. An architectural finding.");
      logLine("Ballot re-routing was NOT caught — L1↔L2 binding gap", "r");
    } else {
      ladder(null, "An attack dies at the lowest rung that can catch it. The lower it dies, the stronger the guarantee.");
    }
  } else {
    lines.push("", c.r(`✗ stopped at: ${data.stoppedAt}`), c.y(data.verdict || ""));
    term("#op-term", lines);

    if (data.infrastructure) {
      // Not a protocol result — do not light up the ladder for it.
      ladder(null, "That failure came from the network or the account, not from the protocol. Nothing was proven or disproven.");
      term("#chain-term", [c.r(`submission failed: ${data.revert}`), c.d("not a contract revert — check balance, nonce, or RPC")]);
      logLine(`Submission failed (infrastructure): ${data.revert}`, "r");
    } else if (data.stoppedAt === "generate batch proof") {
      ladder("L2", "Stopped at L2: the batch circuit could not produce a witness for a false state transition. The operator cannot lie, even to itself.");
      logLine("Batch proof generation blocked by the circuit", "r");
    } else if (data.stoppedAt === "submit to Ethereum L1") {
      ladder("L3", `Stopped at L3: Ethereum reverted with "${data.revert}".`);
      term("#chain-term", [c.r(`revert: "${data.revert}"`), c.d("state root unchanged; operator rolled back")]);
      logLine(`L1 reverted: "${data.revert}"`, "r");
    }
  }

  await refresh();
}

// ------------------------------------------------------------------- refresh

async function refresh() {
  const { data } = await api("/api/state");

  const mp = $("#mempool-list");
  const mpCount = `${data.mempool.length} / ${S.election.batchSize}`;
  $("#mempool-count").textContent = mpCount;
  $("#mempool-count-2").textContent = mpCount;
  $("#nav-mempool").textContent = data.mempool.length;
  $("#nav-batches").textContent = data.chain.batchCount;

  mp.innerHTML = data.mempool.length
    ? data.mempool.map(v => `
        <div class="row ${v.forwardedDespiteFailure ? "bad" : ""}" title="${v.label || ""}">
          <span class="n">#${v.index}</span>
          <span>η ${short(v.nullifierHash, 8, 4)}</span>
          <span class="v">c=${v.candidate} v=${v.vote}${v.forwardedDespiteFailure ? " ⚑" : ""}</span>
        </div>`).join("")
    : '<div class="empty">empty</div>';

  const tallies = data.operator.tallies || {};
  const total = data.operator.totalVotes || 0;
  $("#tally-list").innerHTML = total
    ? S.election.candidates.map(cd => {
        const n = tallies[cd.id] || 0;
        const pct = total ? Math.round(100 * n / total) : 0;
        return `<div class="row"><span class="n">${cd.id}</span><span>${cd.name}</span>
                <span class="v">${n} · ${pct}%</span></div>`;
      }).join("")
    : '<div class="empty">no votes counted yet</div>';

  $("#cs-root").textContent = short(data.chain.stateRoot, 14, 6);
  $("#cs-batches").textContent = data.chain.batchCount;
  $("#cs-nulls").textContent = data.batches.reduce((a, b) => a + b.voteCount, 0);
  $("#cs-active").textContent = data.chain.votingActive ? "true" : "false";
  $("#cs-active").style.color = data.chain.votingActive ? "" : "var(--danger)";
  $("#cs-sync").textContent = data.chainRootMatchesOperator ? "yes" : "NO";
  $("#cs-sync").style.color = data.chainRootMatchesOperator ? "" : "var(--danger)";

  const bl = $("#batch-list");
  bl.innerHTML = data.batches.length
    ? data.batches.map(b => `
        <div class="row click" data-hash="${b.txHash}" title="Open in the block explorer">
          <span class="n">#${b.index}</span>
          <span>${b.voteCount} votes</span>
          <span class="v">${b.gasUsed.toLocaleString()} gas</span>
          ${escan(b.txUrl)}
        </div>`).join("")
    : '<div class="empty">none yet</div>';

  $$("#batch-list .row").forEach(el => el.addEventListener("click", ev => {
    if (ev.target.closest("a")) return;   // let the Etherscan link do its own thing
    show("explorer");
    showTx(el.dataset.hash);
  }));

  if (data.baselineGas) renderGas(data.baselineGas);
}

function renderGas(g) {
  if (!g.rollupPerVote) return;
  const max = Math.max(g.rollupPerVote, g.perVoteZK || 0, g.plain || 0);
  const row = (cls, label, val) => val ? `
    <div class="bar ${cls}">
      <span class="lbl">${label}</span>
      <span class="track"><span class="fill" style="width:${(100 * val / max).toFixed(1)}%"></span></span>
      <span class="val">${val.toLocaleString()}</span>
    </div>` : "";

  $("#gas-sample").textContent = `n = ${g.sampleSize} votes`;
  $("#gas-bars").innerHTML =
    row("rollup", "ZK rollup", g.rollupPerVote) +
    row("zk", "per-vote ZK", g.perVoteZK) +
    row("plain", "non-ZK ballot", g.plain) +
    `<div class="note" style="margin:6px 0 0">
       ${g.savingsVsPerVoteZK !== null ? `${g.savingsVsPerVoteZK}% cheaper than per-vote ZK` : ""}
       ${g.savingsVsPlain !== null ? ` · ${g.savingsVsPlain > 0 ? g.savingsVsPlain + "% cheaper" : Math.abs(g.savingsVsPlain) + "% dearer"} than a public ballot` : ""}
     </div>`;
}

/**
 * Real, already-mined Sepolia transactions. Shown in every mode so a local run
 * can still end on "and here is the same thing on public Ethereum."
 */
async function loadSepoliaReference() {
  const { ok, data } = await api("/api/sepolia-reference");
  const el = $("#sepolia-list");
  if (!ok || !data.transactions.length) {
    $("#sepolia-box").style.display = "none";
    return;
  }

  el.innerHTML = data.transactions.map(t => `
    <div class="row" title="${t.note || ""}">
      <span class="n">${t.method}</span>
      <span>${t.gasUsed.toLocaleString()} gas${t.gasPerVote ? ` · ${t.gasPerVote.toLocaleString()}/vote` : ""}</span>
      ${escan(t.url)}
    </div>`).join("");

  const batch = data.transactions.find(t => t.method === "submitBatch");
  if (batch) {
    el.insertAdjacentHTML("beforeend", `
      <p class="sub" style="margin:10px 0 0">
        ${batch.voteCount} votes · ${batch.calldataBytes.toLocaleString()} bytes calldata ·
        block ${batch.block.toLocaleString()} · ${batch.date}.
        Its postStateRoot matches the local run bit for bit.
      </p>`);
  }
}

// ------------------------------------------------------------------ explorer

let expSelected = null;

async function loadExplorer(selectHash) {
  const { ok, data } = await api("/api/explorer/overview?blocks=10&txs=15");
  if (!ok) return;

  $("#exp-chain").textContent = `chainId ${data.chainId} · ${data.rpcUrl.replace(/^https?:\/\//, "")}`;
  $("#exp-head").textContent = `head #${data.head}`;
  $("#exp-txcount").textContent = `${data.transactions.length} shown`;

  $("#exp-txlist").innerHTML = data.transactions.length
    ? data.transactions.map(t => `
        <div class="txitem" data-hash="${t.hash}">
          <span class="m">${t.method}</span>
          <span class="bn">#${t.blockNumber}</span>
          <span class="to">→ ${t.toLabel} · ${t.calldataBytes.toLocaleString()} B calldata</span>
          <span class="h">${short(t.hash, 14, 6)}</span>
          ${t.url ? `<span style="text-align:right">${escan(t.url)}</span>` : ""}
        </div>`).join("")
    : `<div class="empty">${data.network === "sepolia" ? "no transactions sent yet in this session" : "no transactions"}</div>`;

  $$("#exp-txlist .txitem").forEach(el =>
    el.addEventListener("click", ev => {
      if (ev.target.closest("a")) return;
      showTx(el.dataset.hash);
    }));

  $("#exp-blocklist").innerHTML = data.blocks.length
    ? data.blocks.map(b => `
        <div class="row">
          <span class="n">#${b.number}</span>
          <span>${b.txCount} tx</span>
          <span class="v">${b.gasUsed.toLocaleString()} gas</span>
          ${escan(b.url, "block")}
        </div>`).join("")
    : '<div class="empty">none yet</div>';

  $("#exp-contracts").innerHTML = data.contracts.map(ct => `
    <div class="row click" data-addr="${ct.address}">
      <span>${ct.key}</span>
      <span class="v">${short(ct.address, 8, 6)}</span>
    </div>`).join("");

  $$("#exp-contracts .row").forEach(el =>
    el.addEventListener("click", () => showAddress(el.dataset.addr)));

  const target = selectHash || expSelected ||
    (data.transactions.find(t => t.method === "submitBatch") || {}).hash;
  if (target) await showTx(target);
}

async function showTx(hash) {
  expSelected = hash;
  $$("#exp-txlist .txitem").forEach(el => el.classList.toggle("on", el.dataset.hash === hash));

  const { ok, data: d } = await api(`/api/explorer/tx/${hash}`);
  if (!ok) { $("#exp-detail").innerHTML = `<div class="empty">${d.error}</div>`; return; }

  const field = (k, v) => `<div class="txfield"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  const args = d.inputDecoded.map(a => `
    <div class="arg">
      <span class="an">${a.name}</span><span class="at">${a.type}</span>
      ${a.summary ? `<span class="as">${a.summary}</span>` : ""}
      <div class="av">${a.values.map(v => Array.isArray(v) ? v.join(", ") : v).join("<br>")}${a.truncated ? `<br><span style="color:var(--fg-faint)">… ${a.totalValues - 24} more</span>` : ""}</div>
    </div>`).join("");

  const logs = d.logs.map(l => `
    <div class="logentry">
      <span class="ln">${l.name || "unindexed log"}</span>
      <span class="la">${l.addressLabel}</span>
      <dl>${l.args.map(a => `<dt>${a.name}</dt><dd>${a.value}</dd>`).join("")}</dl>
    </div>`).join("");

  $("#exp-detail").innerHTML = `
    <div class="txhead">
      <span class="sig">${d.method ? d.method.signature : (d.to ? "raw call" : "contract creation")}</span>
      <span class="status ${d.status === "Success" ? "ok" : "bad"}">${d.status}</span>
      ${escan(d.url, "View on Etherscan", "big")}
    </div>

    <div class="txfields">
      ${field("Tx hash", short(d.hash, 20, 8))}
      ${field("Block", `#${d.blockNumber}${d.confirmations ? ` <span style="color:var(--fg-faint)">· ${d.confirmations} confirmation${d.confirmations === 1 ? "" : "s"}</span>` : ""}`)}
      ${field("From", `${short(d.from, 10, 6)}<br><span style="color:var(--fg-faint)">${d.fromLabel}</span>`)}
      ${field("To", `${d.to ? short(d.to, 10, 6) : "—"}<br><span style="color:var(--fg-faint)">${d.toLabel}</span>`)}
      ${field("Gas used", d.gasUsed ? d.gasUsed.toLocaleString() : "—")}
      ${field("Gas price", d.gasPriceGwei ? `${d.gasPriceGwei} gwei` : "—")}
      ${field("Tx fee", d.feeEth ? `${Number(d.feeEth).toFixed(8)} ETH` : "—")}
      ${field("Calldata", `${d.calldataBytes.toLocaleString()} bytes`)}
    </div>

    ${args ? `<div class="section"><div class="cardhead"><h4>Decoded input</h4></div>${args}</div>` : ""}
    ${logs ? `<div class="section"><div class="cardhead"><h4>Event logs</h4></div>${logs}</div>` : ""}

    <details class="section">
      <summary style="cursor:pointer;font-size:11.5px;color:var(--fg-dim);padding:5px 0">Raw input data</summary>
      <div class="rawdata">${d.calldataHex.slice(0, 3000)}${d.calldataHex.length > 3000 ? " …" : ""}</div>
    </details>`;
}

async function showAddress(addr) {
  const { ok, data: a } = await api(`/api/explorer/address/${addr}`);
  if (!ok) return;

  const field = (k, v) => `<div class="txfield"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  $("#exp-detail").innerHTML = `
    <div class="txhead">
      <span class="sig">${a.label}</span>
      <span class="status ok">${a.isContract ? "Contract" : "EOA"}</span>
      ${escan(a.url, "View on Etherscan", "big")}
    </div>
    <div class="txfields">
      ${field("Address", a.address)}
      ${field("Bytecode", a.isContract ? `${a.bytecodeBytes.toLocaleString()} bytes` : "—")}
      ${field("Balance", `${Number(a.balanceEth).toFixed(4)} ETH`)}
      ${field("Tx count", a.txCount)}
    </div>
    ${a.state ? `
      <div class="section"><div class="cardhead"><h4>Live contract state</h4></div>
        <div class="txfields">
          ${field("stateRoot", short(a.state.stateRoot, 18, 8))}
          ${field("voterMerkleRoot", short(a.state.voterMerkleRoot, 18, 8))}
          ${field("electionId", a.state.electionId)}
          ${field("batchCount", a.state.batchCount)}
          ${field("votingActive", a.state.votingActive)}
        </div>
      </div>` : ""}`;
}

// ------------------------------------------------------- observer + lifecycle

async function observe() {
  const { data } = await api("/api/state");
  const last = data.batches[data.batches.length - 1];
  if (!last) { $("#observer-list").innerHTML = '<li class="muted">no batch to verify</li>'; return; }

  $("#observer-list").innerHTML = '<li class="muted pulsing">fetching calldata…</li>';
  const res = await api("/api/observer/verify", { method: "POST", body: { txHash: last.txHash } });

  $("#observer-list").innerHTML = (res.data.steps || []).map(s => `
    <li><span class="mark ${s.status === "ok" ? "ok" : "bad"}">${s.status === "ok" ? "✓" : "✗"}</span>
    <span><span class="ckname">${s.name}</span><br><span class="ckdetail">${s.detail}</span></span></li>`).join("");

  logLine(res.data.ok ? `Observer independently verified batch ${res.data.batchIndex}` : "Observer verification FAILED", res.data.ok ? "g" : "r");
}

function lifecycleResult(title, r) {
  const good = r.ok === false && r.revert;
  const how = r.simulated ? " · simulated via eth_call (no testnet ETH spent)" : "";
  $("#lifecycle-list").innerHTML = `
    <li><span class="mark ${good ? "ok" : r.ok ? "warn" : "bad"}">${good ? "✓" : r.ok ? "!" : "✗"}</span>
    <span><span class="ckname">${title}</span><br>
    <span class="ckdetail">${r.ok ? "succeeded" : `reverted: "${r.revert}"`}${r.expected ? ` · expected "${r.expected}"` : ""}${how}</span>
    ${r.txUrl ? `<br>${escan(r.txUrl)}` : ""}</span></li>`;
  if (r.expected && !r.ok) {
    ladder("L3", `Stopped at L3: Ethereum reverted with "${r.revert}".`);
  }
  logLine(`${title}: ${r.ok ? "succeeded" : `reverted "${r.revert}"`}`, r.ok && r.expected ? "r" : "g");
}

// ---------------------------------------------------------------- wire it up

$$(".navlink").forEach(b => b.addEventListener("click", () => {
  show(b.dataset.view);
  $("#sidenav").classList.remove("open");   // collapse again on narrow screens
}));

$("#btn-menu").addEventListener("click", () => $("#sidenav").classList.toggle("open"));

$("#nav-cta").addEventListener("click", () => {
  const v = VIEWS[S.view];
  if (v && v.action) v.action();
});

$("#btn-goto-voter").addEventListener("click", () => show("voter"));

$("#logbar").addEventListener("click", ev => {
  if (ev.target.closest("#btn-clearlog")) return;
  $("#logpanel").classList.toggle("open");
});
$("#btn-log-toggle").addEventListener("click", () => $("#logpanel").classList.toggle("open"));

$("#overlay-scrim").addEventListener("click", closeOverlay);
$("#overlay-close").addEventListener("click", ev => {
  const to = ev.currentTarget.dataset.goto;
  closeOverlay();
  if (to) { delete ev.currentTarget.dataset.goto; show(to); }
});
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape") closeOverlay();
});

$("#btn-discard").addEventListener("click", () => {
  $("#sel-attack").value = "none";
  loadCredentials(S.voterIndex);
  proofStage(null);
  term("#voter-term", "Ballot reset. Pick a voter and a candidate to begin.");
});


$("#sel-attack").addEventListener("change", () => loadCredentials(S.voterIndex));
$("#btn-prove").addEventListener("click", proveAndSend);
$("#btn-batch").addEventListener("click", submitBatch);
$("#btn-observe").addEventListener("click", observe);
$("#btn-exp-refresh").addEventListener("click", () => loadExplorer());

$("#btn-prefill").addEventListener("click", async () => {
  const btn = $("#btn-prefill");
  btn.classList.add("busy", "pulsing");
  const count = Number($("#prefill-count").value) || 16;
  const { data } = await api("/api/prefill", { method: "POST", body: { count } });
  btn.classList.remove("busy", "pulsing");
  term("#op-term", [
    c.d(`+ ${data.added} simulated ballot(s) — real proofs, generated server-side`),
    c.d(`  mempool ${data.mempoolSize}/${S.election.batchSize}`)
  ], true);
  logLine(`Pre-filled ${data.added} ballots — mempool ${data.mempoolSize}/${S.election.batchSize}`, "b");
  await refresh();
});

$("#btn-baselines").addEventListener("click", async () => {
  $("#btn-baselines").classList.add("busy", "pulsing");
  const { ok, data } = await api("/api/baselines/measure", { method: "POST" });
  $("#btn-baselines").classList.remove("busy", "pulsing");
  if (!ok) { $("#gas-bars").innerHTML = `<div class="empty">${data.error}</div>`; return; }
  renderGas(data);
  logLine(`Baselines: rollup ${data.rollupPerVote} vs per-vote ZK ${data.perVoteZK} vs plain ${data.plain} gas/vote`, "b");
});

$("#btn-end").addEventListener("click", async () => {
  const { data } = await api("/api/lifecycle/end-voting", { method: "POST" });
  lifecycleResult("End voting (admin)", data);
  await refresh();

  if (data.ok) {
    const stateRes = await api("/api/state");
    const tallies = stateRes.data.operator.tallies || {};
    const total = stateRes.data.operator.totalVotes || 0;
    
    const rows = S.election.candidates.map(cd => {
        const n = tallies[cd.id] || 0;
        const pct = total ? Math.round(100 * n / total) : 0;
        return { k: `${cd.id} - ${cd.name}`, v: `${n} votes (${pct}%)` };
    });
    rows.push({ k: "Total Votes", v: `${total}`, dim: true });
    
    overlay({
      title: "Election Ended",
      lede: "The voting is closed. Here is the final tally reconstructed from the operator's state tree.",
      rows: rows,
      closeLabel: "Understood"
    });
  }
});

$("#btn-end-nonadmin").addEventListener("click", async () => {
  const { data } = await api("/api/attack/end-voting-nonadmin", { method: "POST" });
  lifecycleResult("End voting as non-admin", data);
});

$("#btn-zero").addEventListener("click", async () => {
  const { data } = await api("/api/attack/deploy-zero-verifier", { method: "POST" });
  lifecycleResult("Deploy with zero verifier address", data);
});

$("#btn-replay").addEventListener("click", async () => {
  const { data } = await api("/api/attack/replay-batch", { method: "POST", body: {} });
  lifecycleResult("Replay an accepted batch", data);
});

$("#btn-reset").addEventListener("click", async ev => {
  ev.preventDefault();
  $("#btn-reset").classList.add("busy");
  await api("/api/reset", { method: "POST" });
  $("#btn-reset").classList.remove("busy");
  $("#eventlog").innerHTML = "";
  $("#observer-list").innerHTML = '<li class="muted">not run</li>';
  $("#lifecycle-list").innerHTML = '<li class="muted">no action yet</li>';
  $("#gas-bars").innerHTML = '<div class="empty">submit a batch, then measure</div>';
  $("#exp-detail").innerHTML = '<div class="empty">select a transaction on the left</div>';
  expSelected = null;
  renderChecks([]);
  ladder(null, "An attack dies at the lowest rung that can catch it. The lower it dies, the stronger the guarantee.");
  await boot();
});

$("#btn-clearlog").addEventListener("click", () => { $("#eventlog").innerHTML = ""; });

show("voter");

boot().catch(err => {
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="padding:20px;background:#40191c;color:#ffb4ae;font:14px monospace;position:relative;z-index:99">
       Could not reach the demo server: ${err.message}<br>Is <code>node demo/server.js</code> running?
     </div>`);
});
