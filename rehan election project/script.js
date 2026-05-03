/* ============================================================
   ELECTION INTELLIGENCE ASSISTANT — CORE LOGIC
   script.js
   ============================================================ */

/* ===== STATE VARIABLES ===== */
let chatHistory  = [];      // Stores { role, content, time } for localStorage persistence
let lastIntent   = null;    // Remembers last detected intent for context-aware follow-ups
let msgCount     = 0;       // Tracks total messages rendered
let isTyping     = false;   // Prevents double-send while bot is responding
const MAX_DELAY  = 1200;    // Max simulated thinking time (ms)
const MIN_DELAY  = 600;     // Min simulated thinking time (ms)

/* ===== INITIALISE ON DOM READY ===== */
window.addEventListener('DOMContentLoaded', () => {
  initCanvas();    // Start animated background
  loadHistory();   // Restore previous chat from localStorage
  applyTheme();    // Apply saved light/dark preference
});

/* ============================================================
   1. handleUserInput()
   Entry point — reads textarea, runs the full pipeline
   ============================================================ */
function handleUserInput() {
  const raw     = document.getElementById('chatInput').value;
  const cleaned = cleanInput(raw);
  if (!cleaned || isTyping) return;  // Guard: empty input or still typing

  hideWelcome();                       // Dismiss welcome screen on first message
  displayMessage(cleaned, 'user');     // Show user bubble immediately
  clearInput();                        // Reset textarea

  const intent = detectIntent(cleaned);
  lastIntent   = intent;

  showTyping();                        // Show "…" indicator
  const delay = calculateDelay(cleaned);

  setTimeout(() => {
    hideTyping();
    const response = generateResponse(intent, cleaned);
    displayMessage(response, 'bot');   // Render bot reply
    maintainContext(intent, cleaned);  // Update context memory
    saveHistory();                     // Persist to localStorage
  }, delay);
}

/* ============================================================
   2. cleanInput()
   Sanitizes and normalises raw user text
   ============================================================ */
function cleanInput(raw) {
  return raw
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .substring(0, 500);    // Hard cap at 500 characters
}

/* ============================================================
   3. detectIntent()
   Keyword + regex pattern matching for intent classification.
   Returns one of 11 named intent strings.
   ============================================================ */
function detectIntent(text) {
  const t = text.toLowerCase();

  /* --- Greetings --- */
  if (/^(hi|hello|hey|good\s*(morning|evening|afternoon|day)|sup|howdy|greetings)\b/.test(t))
    return 'greeting';

  /* --- Gratitude --- */
  if (/(thank(s| you)|cheers|appreciate|great help|awesome|wonderful|brilliant)/.test(t))
    return 'thanks';

  /* --- Help / menu request --- */
  if (/(help|what can you|topics|what do you know|menu|options)/.test(t))
    return 'help';

  /* --- Voting steps --- */
  if (/(how (do|to|can) (i |we |one |)vote|voting (steps|process|procedure|guide)|cast (a |my |)vote|ballot|polling (booth|station|day)|election day|where (to|do i) vote)/.test(t))
    return 'voting_steps';

  /* --- Voter registration --- */
  if (/(register|registration|voter (id|card|enrollment)|enroll|sign up (to|for) vote|apply (for|to) vote)/.test(t))
    return 'registration';

  /* --- Eligibility --- */
  if (/(eligible|eligib|who can vote|am i (eligible|allowed|able) to vote|age (limit|requirement)|citizenship|qualify|qualif|conditions (to|for) vote|can i vote)/.test(t))
    return 'eligibility';

  /* --- Election timeline / phases --- */
  if (/(timeline|schedule|dates|phases|when is|election (date|day|calendar)|announcement|campaign period|counting|result|phase)/.test(t))
    return 'election_timeline';

  /* --- Election process overview --- */
  if (/(process|how (does|do) (election|voting) work|how (are|is) (election|vote)|steps of election|election system|overview|explain election)/.test(t))
    return 'election_process';

  /* --- Required documents --- */
  if (/(document|id proof|id card|id required|what (do i|should i) bring|proof|paper|requirement)/.test(t))
    return 'documents';

  /* --- Results & counting --- */
  if (/(result|count(ing)?|announce|winner|declare|tally|how (are|is) (result|vote count))/.test(t))
    return 'results';

  /* --- Contextual follow-ups: continue last topic --- */
  if (/(next|then|continue|more|after|what else|go on|step \d|tell me more)/.test(t) && lastIntent)
    return lastIntent;

  /* --- Fallback --- */
  return 'fallback';
}

/* ============================================================
   4. generateResponse()
   Dispatches to the correct response generator based on intent.
   Returns an HTML string that is injected into a bubble.
   ============================================================ */
function generateResponse(intent, userText) {
  const handlers = {
    greeting:          respGreeting,
    thanks:            respThanks,
    help:              respHelp,
    voting_steps:      respVotingSteps,
    registration:      respRegistration,
    eligibility:       respEligibility,
    election_timeline: respTimeline,
    election_process:  respElectionProcess,
    documents:         respDocuments,
    results:           respResults,
    fallback:          respFallback,
  };
  return (handlers[intent] || respFallback)(userText);
}

/* ============================================================
   5. displayMessage()
   Creates a chat bubble group and appends it to the DOM.
   role: 'user' | 'bot'
   content: plain text (user) or HTML string (bot)
   ============================================================ */
function displayMessage(content, role) {
  const container = document.getElementById('chatContainer');
  const typingEl  = document.getElementById('typingIndicator');

  /* --- Outer group --- */
  const group = document.createElement('div');
  group.className = 'msg-group';

  /* --- Row (avatar + bubble) --- */
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${role}`;

  /* --- Avatar --- */
  const avatar = document.createElement('div');
  avatar.className  = `avatar ${role}`;
  avatar.textContent = role === 'bot' ? '🤖' : '👤';

  /* --- Bubble --- */
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.innerHTML  = content;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  group.appendChild(msgDiv);

  /* --- Timestamp --- */
  const timeEl = document.createElement('div');
  timeEl.className  = 'time-label';
  timeEl.textContent = formatTime(new Date());
  group.appendChild(timeEl);

  /* Insert before typing indicator if it's in the container */
  if (typingEl.parentNode === container) {
    container.insertBefore(group, typingEl);
  } else {
    container.appendChild(group);
  }

  /* Bind data-ask chips inside the bubble */
  bubble.querySelectorAll('[data-ask]').forEach(el => {
    el.addEventListener('click', () => askQuick(el.dataset.ask));
  });

  scrollToBottom();
  msgCount++;

  /* Push to in-memory history array */
  chatHistory.push({ role, content, time: Date.now() });
}

/* ============================================================
   6. maintainContext()
   Updates lastIntent so follow-up queries can continue the
   same topic flow without the user restating it.
   ============================================================ */
function maintainContext(intent) {
  if (intent !== 'fallback' && intent !== 'greeting' && intent !== 'thanks') {
    lastIntent = intent;
  }
}

/* ============================================================
   RESPONSE GENERATORS
   Each returns an HTML string inserted into a .bubble.bot div
   ============================================================ */

/* Greeting */
function respGreeting() {
  const picks = [
    'Hello! 👋 Welcome to the Election Intelligence Assistant.',
    'Hi there! 👋 Great to see you.',
    'Hey! 👋 Good to have you here.',
  ];
  const g = picks[Math.floor(Math.random() * picks.length)];
  return `
    <h4>🗳️ Welcome</h4>
    <p>${g} I'm your guide to understanding the electoral process. Here's what I can help you with:</p>
    <ul>
      <li>🗳️ <strong>Voting Steps</strong> — How to cast your ballot</li>
      <li>⚡ <strong>Election Process</strong> — End-to-end overview</li>
      <li>📋 <strong>Registration</strong> — How to enrol as a voter</li>
      <li>✅ <strong>Eligibility</strong> — Who qualifies to vote</li>
      <li>📅 <strong>Timeline</strong> — Key election dates &amp; phases</li>
    </ul>
    <div class="tag-row">
      <span class="tag" data-ask="How do I vote?">How to vote →</span>
      <span class="tag" data-ask="Am I eligible to vote?">Check eligibility →</span>
    </div>
  `;
}

/* Gratitude */
function respThanks() {
  const picks = [
    "You're very welcome! 😊 Is there anything else you'd like to know about the election process?",
    "Happy to help! 🌟 Feel free to ask if you have more questions.",
    "Anytime! 💪 Being an informed voter is incredibly important. What else can I help with?",
  ];
  return `
    <p>${picks[Math.floor(Math.random() * picks.length)]}</p>
    <div class="tag-row">
      <span class="tag" data-ask="How do I vote?">Voting steps</span>
      <span class="tag" data-ask="What is the election timeline?">Timeline</span>
      <span class="tag" data-ask="Am I eligible to vote?">Eligibility</span>
    </div>
  `;
}

/* Help / topic menu */
function respHelp() {
  return `
    <h4>🧭 Topics I Can Help With</h4>
    <ul>
      <li>🗳️ <strong>How to Vote</strong> — Step-by-step polling day guide</li>
      <li>⚡ <strong>Election Process</strong> — From announcement to results</li>
      <li>📋 <strong>Voter Registration</strong> — How and where to register</li>
      <li>✅ <strong>Eligibility</strong> — Age, citizenship &amp; conditions</li>
      <li>📅 <strong>Election Timeline</strong> — Phases and key dates</li>
      <li>📄 <strong>Documents Needed</strong> — ID and paperwork required</li>
      <li>🔢 <strong>Vote Counting</strong> — How ballots are tallied</li>
    </ul>
    <div class="tag-row">
      <span class="tag" data-ask="How do I vote?">Start here →</span>
    </div>
  `;
}

/* Voting steps */
function respVotingSteps() {
  return `
    <h4>🗳️ How to Vote — Step by Step</h4>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(37,99,255,0.2);color:#93c5fd;">1</div>
      <div class="tl-content">
        <div class="tl-title">Check Your Registration</div>
        <div class="tl-desc">Verify your name is on the electoral roll before election day. Visit your local election authority's website or office.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(99,102,241,0.2);color:#a5b4fc;">2</div>
      <div class="tl-content">
        <div class="tl-title">Know Your Polling Booth</div>
        <div class="tl-desc">Your polling booth is assigned based on your registered address. It is printed on your voter slip or ID card.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(245,158,11,0.2);color:#fbbf24;">3</div>
      <div class="tl-content">
        <div class="tl-title">Bring Valid ID</div>
        <div class="tl-desc">Carry your Voter ID card, Aadhaar, passport, driving licence, or any approved government photo ID.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(20,184,166,0.2);color:#5eead4;">4</div>
      <div class="tl-content">
        <div class="tl-title">Visit the Polling Booth</div>
        <div class="tl-desc">Go to your assigned booth on election day (usually 7 AM – 6 PM). Look for your name in the voter list queue.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(244,63,94,0.2);color:#fb7185;">5</div>
      <div class="tl-content">
        <div class="tl-title">Identity Verification</div>
        <div class="tl-desc">Officials verify your identity and mark your name in the register. Your left index finger is inked to prevent double voting.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(34,197,94,0.2);color:#4ade80;">6</div>
      <div class="tl-content">
        <div class="tl-title">Cast Your Vote</div>
        <div class="tl-desc">Enter the voting compartment, press the button next to your chosen candidate on the EVM, wait for the beep — done!</div>
      </div>
    </div>
    <div class="highlight-box">💡 Voting is your democratic right. Booths are kept strictly confidential — no one can see your choice.</div>
    <div class="tag-row">
      <span class="tag" data-ask="What documents do I need?">Documents needed</span>
      <span class="tag" data-ask="How do I register to vote?">Registration</span>
      <span class="tag" data-ask="What is the election timeline?">View timeline</span>
    </div>
  `;
}

/* Election process overview */
function respElectionProcess() {
  return `
    <h4>⚡ The Election Process — Full Overview</h4>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">From announcement to sworn-in leaders, here's how a democratic election unfolds:</p>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(37,99,255,0.2);color:#93c5fd;">①</div>
      <div class="tl-content">
        <div class="tl-title">📢 Election Announcement</div>
        <div class="tl-desc">The Election Commission officially announces the election schedule, including voting dates, nomination deadlines, and result day.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(99,102,241,0.2);color:#a5b4fc;">②</div>
      <div class="tl-content">
        <div class="tl-title">📝 Nomination &amp; Scrutiny</div>
        <div class="tl-desc">Candidates file nominations. Election officials scrutinize the forms and candidates may withdraw before the deadline.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(245,158,11,0.2);color:#fbbf24;">③</div>
      <div class="tl-content">
        <div class="tl-title">🎤 Campaign Period</div>
        <div class="tl-desc">Parties and candidates campaign, hold rallies, debates, and canvass votes. Model Code of Conduct enforced by the EC.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(20,184,166,0.2);color:#5eead4;">④</div>
      <div class="tl-content">
        <div class="tl-title">🗳️ Polling / Voting Day</div>
        <div class="tl-desc">Registered voters visit booths, verify identity, and cast votes using Electronic Voting Machines (EVMs) or paper ballots.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(244,63,94,0.2);color:#fb7185;">⑤</div>
      <div class="tl-content">
        <div class="tl-title">🔢 Vote Counting</div>
        <div class="tl-desc">On counting day, votes are tallied under the supervision of returning officers. Party agents are allowed to observe.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(34,197,94,0.2);color:#4ade80;">⑥</div>
      <div class="tl-content">
        <div class="tl-title">🏆 Result Declaration</div>
        <div class="tl-desc">Results are officially declared. Winners receive certificates of election and are sworn into office.</div>
      </div>
    </div>
    <div class="tag-row">
      <span class="tag" data-ask="What is the election timeline?">Dates &amp; phases</span>
      <span class="tag" data-ask="How are results announced?">Results process</span>
    </div>
  `;
}

/* Registration */
function respRegistration() {
  return `
    <h4>📋 Voter Registration Guide</h4>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">Register once and vote for life (as long as you meet eligibility requirements).</p>
    <ul>
      <li><strong>🌐 Online:</strong> Visit <em>voters.eci.gov.in</em> or your country's official voter portal. Fill Form 6 for new registration.</li>
      <li><strong>📬 Offline:</strong> Visit the Electoral Registration Officer (ERO) at your local government office or post office.</li>
      <li><strong>📱 Voter Helpline App:</strong> Download the official Voter Helpline app to register from your smartphone.</li>
      <li><strong>🏛️ Voter Service Centres:</strong> Visit nearest Voter Service Centre (VSC) — often set up at schools and community halls.</li>
    </ul>
    <div class="highlight-box">
      📋 <strong>Required for Registration:</strong><br/>
      Age proof (birth certificate / 10th marksheet) · Address proof (Aadhaar / utility bill) · Recent passport-size photograph · Filled Form 6
    </div>
    <ul style="margin-top:10px;">
      <li><strong>Deadline:</strong> Register at least 4–6 weeks before election day</li>
      <li><strong>Corrections:</strong> Use Form 8 to update name, address, or photo</li>
      <li><strong>Check Status:</strong> SMS "EPIC &lt;Voter ID No.&gt;" to 1950</li>
    </ul>
    <div class="tag-row">
      <span class="tag" data-ask="Am I eligible to vote?">Check eligibility</span>
      <span class="tag" data-ask="What documents do I need?">Documents needed</span>
    </div>
  `;
}

/* Eligibility */
function respEligibility() {
  return `
    <h4>✅ Voter Eligibility Criteria</h4>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">To exercise your right to vote, you must meet all of the following conditions:</p>
    <ul>
      <li>🎂 <strong>Age:</strong> Must be 18 years or older on the qualifying date (1st January of the registration year in India)</li>
      <li>🌍 <strong>Citizenship:</strong> Must be a citizen of the country (Indian citizen for Indian elections)</li>
      <li>🏠 <strong>Residence:</strong> Must be an ordinary resident of the constituency where you wish to vote</li>
      <li>🧠 <strong>Sound Mind:</strong> Must not have been declared of unsound mind by a competent court</li>
      <li>⚖️ <strong>No Criminal Disqualification:</strong> Not serving a sentence for corrupt practices or certain criminal offences</li>
      <li>📋 <strong>Enrollment:</strong> Name must be on the official Electoral Roll of the constituency</li>
    </ul>
    <div class="highlight-box">
      🚫 <strong>Who Cannot Vote:</strong> Non-citizens · Persons under 18 · Those disqualified by court · Individuals serving sentence for election offences
    </div>
    <div class="tag-row">
      <span class="tag" data-ask="How do I register to vote?">Register now</span>
      <span class="tag" data-ask="What documents do I need?">Required documents</span>
    </div>
  `;
}

/* Timeline */
function respTimeline() {
  return `
    <h4>📅 Election Timeline &amp; Phases</h4>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">A general election typically unfolds across these phases:</p>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(37,99,255,0.2);color:#93c5fd;font-size:10px;">~6M</div>
      <div class="tl-content">
        <div class="tl-title">6 Months Before — Preparation</div>
        <div class="tl-desc">Electoral rolls updated, booths prepared, voter awareness campaigns launched. Last date to register as a voter.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(99,102,241,0.2);color:#a5b4fc;font-size:10px;">~3M</div>
      <div class="tl-content">
        <div class="tl-title">3 Months Before — Official Announcement</div>
        <div class="tl-desc">Election Commission issues Model Code of Conduct. Schedule announced. Dates for nomination, scrutiny, and withdrawal set.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(245,158,11,0.2);color:#fbbf24;font-size:10px;">~6W</div>
      <div class="tl-content">
        <div class="tl-title">6 Weeks Before — Nomination Period</div>
        <div class="tl-desc">Candidates file nomination papers. Scrutiny takes place. Final list of candidates published after withdrawal deadline.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(20,184,166,0.2);color:#5eead4;font-size:10px;">~4W</div>
      <div class="tl-content">
        <div class="tl-title">4 Weeks Before — Campaign Period</div>
        <div class="tl-desc">Parties and candidates hold rallies, debates, and door-to-door campaigns. Campaigning ends 48 hours before polling.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(244,63,94,0.2);color:#fb7185;">🗳️</div>
      <div class="tl-content">
        <div class="tl-title">Polling Day</div>
        <div class="tl-desc">Voting takes place from 7 AM to 6 PM (may vary). EVMs sealed and moved to strong rooms under security after polling ends.</div>
      </div>
    </div>
    <div class="timeline-step">
      <div class="tl-num" style="background:rgba(34,197,94,0.2);color:#4ade80;">🏆</div>
      <div class="tl-content">
        <div class="tl-title">Counting &amp; Result Day</div>
        <div class="tl-desc">Votes counted under strict supervision. Results declared. Election Commission certifies winners. Successful candidates take oath.</div>
      </div>
    </div>
    <div class="tag-row">
      <span class="tag" data-ask="How do I vote?">Voting steps</span>
      <span class="tag" data-ask="What is the election process?">Full process</span>
    </div>
  `;
}

/* Required documents */
function respDocuments() {
  return `
    <h4>📄 Documents Required for Voting</h4>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">At least <strong>one</strong> of these government-issued IDs is accepted at polling booths:</p>
    <ul>
      <li>🪪 <strong>Voter ID Card (EPIC)</strong> — Issued by Election Commission — <em>primary &amp; preferred</em></li>
      <li>🔵 <strong>Aadhaar Card</strong> — UIDAI issued biometric identity card</li>
      <li>🛂 <strong>Passport</strong> — Indian passport (valid or expired)</li>
      <li>🚗 <strong>Driving Licence</strong> — Issued by RTO with photograph</li>
      <li>🏦 <strong>Passbook with Photo</strong> — Bank or Post Office passbook</li>
      <li>🎓 <strong>Student ID</strong> — From recognised educational institutions</li>
      <li>💼 <strong>MNREGS Job Card</strong> — With photograph</li>
      <li>📱 <strong>mVoter / Voter Slip</strong> — Digital slip from Voter Helpline App</li>
    </ul>
    <div class="highlight-box">
      🔑 <strong>For First-Time Registration</strong>, additionally bring:<br/>
      Age proof · Address proof · 2 passport-size photos · Filled Form 6
    </div>
    <div class="tag-row">
      <span class="tag" data-ask="How do I register to vote?">Registration process</span>
      <span class="tag" data-ask="How do I vote?">Voting steps</span>
    </div>
  `;
}

/* Results & counting */
function respResults() {
  return `
    <h4>🔢 Vote Counting &amp; Result Declaration</h4>
    <ul>
      <li>📦 <strong>EVM Transport:</strong> Voting machines are sealed &amp; transported to counting centres under police escort</li>
      <li>🔐 <strong>Strong Room:</strong> EVMs stored in CCTV-monitored, sealed strong rooms. Party agents can stand guard</li>
      <li>📋 <strong>Counting Day:</strong> On the designated date, Returning Officers open EVMs in the presence of candidates &amp; agents</li>
      <li>🔄 <strong>Round-by-Round:</strong> Votes counted round by round, each round's tally announced publicly</li>
      <li>✅ <strong>VVPAT Verification:</strong> Paper slips randomly verified against EVM counts for accuracy</li>
      <li>🏆 <strong>Declaration:</strong> Winning candidate receives a Certificate of Election from the Returning Officer</li>
      <li>📺 <strong>Public Updates:</strong> Results updated live on the Election Commission website and national media</li>
    </ul>
    <div class="highlight-box">
      🛡️ EVMs are tamper-proof machines — votes cannot be manipulated after casting. VVPAT provides an independent paper trail for verification.
    </div>
    <div class="tag-row">
      <span class="tag" data-ask="What is the election process?">Full process</span>
      <span class="tag" data-ask="What is the election timeline?">Timeline</span>
    </div>
  `;
}

/* Fallback */
function respFallback() {
  const contextTip = lastIntent
    ? `<p style="color:var(--text-secondary);font-size:13px;">We were discussing <strong>${intentLabel(lastIntent)}</strong> — want to continue there?</p>`
    : '';
  return `
    <h4>🤔 I'm not sure I understood that</h4>
    ${contextTip}
    <p>Here's what I can help you with — tap any topic below:</p>
    <div class="tag-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
      <span class="tag" data-ask="How do I vote?">🗳️ How to vote</span>
      <span class="tag" data-ask="What is the election process?">⚡ Election process</span>
      <span class="tag" data-ask="How do I register to vote?">📋 Voter registration</span>
      <span class="tag" data-ask="Am I eligible to vote?">✅ Eligibility criteria</span>
      <span class="tag" data-ask="What is the election timeline?">📅 Election timeline</span>
      <span class="tag" data-ask="What documents do I need?">📄 Required documents</span>
    </div>
  `;
}

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/** Map intent key → human-readable label for context messages */
function intentLabel(intent) {
  const map = {
    voting_steps:      'Voting Steps',
    election_process:  'Election Process',
    registration:      'Voter Registration',
    eligibility:       'Eligibility',
    election_timeline: 'Election Timeline',
    documents:         'Required Documents',
    results:           'Vote Counting & Results',
  };
  return map[intent] || intent;
}

/** Scale simulated delay to input length — feels more realistic */
function calculateDelay(text) {
  const words = text.split(' ').length;
  return Math.min(MIN_DELAY + words * 40, MAX_DELAY);
}

/** Show the animated typing indicator */
function showTyping() {
  isTyping = true;
  const ti        = document.getElementById('typingIndicator');
  const container = document.getElementById('chatContainer');
  container.appendChild(ti);
  ti.classList.add('active');
  scrollToBottom();
}

/** Hide the typing indicator */
function hideTyping() {
  isTyping = false;
  document.getElementById('typingIndicator').classList.remove('active');
}

/** Smooth-scroll chat to the latest message */
function scrollToBottom() {
  const c = document.getElementById('chatContainer');
  setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
}

/** Animate the welcome screen out before the first message */
function hideWelcome() {
  const w = document.getElementById('welcomeScreen');
  if (!w) return;
  w.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  w.style.opacity    = '0';
  w.style.transform  = 'translateY(-10px)';
  setTimeout(() => w.remove(), 300);
}

/** Reset the textarea after sending */
function clearInput() {
  const el = document.getElementById('chatInput');
  el.value       = '';
  el.style.height = 'auto';
  document.getElementById('charCount').textContent = '0/500';
}

/** Auto-grow textarea and update char counter */
function handleInputChange(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  document.getElementById('charCount').textContent = `${el.value.length}/500`;
}

/** Handle Enter (send) vs Shift+Enter (newline) */
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleUserInput();
  }
}

/** Populate the input with a preset question and send it */
function askQuick(text) {
  document.getElementById('chatInput').value = text;
  handleUserInput();
}

/** Format a Date into HH:MM */
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
function toggleTheme() {
  const html    = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  html.setAttribute('data-theme', isLight ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('eia_theme', isLight ? 'dark' : 'light');
}

function applyTheme() {
  const saved = localStorage.getItem('eia_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeBtn').textContent = saved === 'light' ? '🌙' : '☀️';
}

/* ============================================================
   LOCAL STORAGE — CHAT HISTORY PERSISTENCE
   ============================================================ */
function saveHistory() {
  try {
    localStorage.setItem('eia_history', JSON.stringify(chatHistory.slice(-60)));
  } catch (e) { /* quota exceeded — silently ignore */ }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem('eia_history') || '[]');
    if (saved.length > 0) {
      hideWelcome();
      saved.forEach(m => displayMessage(m.content, m.role));
      chatHistory = saved;
    }
  } catch (e) { /* corrupt data — silently ignore */ }
}

/* ============================================================
   CONFIRM MODAL — CLEAR HISTORY
   ============================================================ */
function openConfirm()  { document.getElementById('confirmModal').classList.add('open');    }
function closeConfirm() { document.getElementById('confirmModal').classList.remove('open'); }

function confirmClear() {
  chatHistory = []; lastIntent = null; msgCount = 0;
  localStorage.removeItem('eia_history');

  const container = document.getElementById('chatContainer');
  container.innerHTML = '';

  /* Rebuild welcome screen */
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.id        = 'welcomeScreen';
  welcome.innerHTML = `
    <div class="welcome-orb">🗳️</div>
    <h1 class="welcome-title">Your Election Guide</h1>
    <p class="welcome-sub">Ask me anything about voting, elections, registration, eligibility, or the democratic process.</p>
    <div class="quick-topics">
      <button class="topic-chip" onclick="askQuick('How do I vote?')"><span class="chip-icon">🗳️</span>How do I vote?</button>
      <button class="topic-chip" onclick="askQuick('What is the election process?')"><span class="chip-icon">⚡</span>Election process</button>
      <button class="topic-chip" onclick="askQuick('How do I register to vote?')"><span class="chip-icon">📋</span>Voter registration</button>
      <button class="topic-chip" onclick="askQuick('Am I eligible to vote?')"><span class="chip-icon">✅</span>Check eligibility</button>
      <button class="topic-chip" onclick="askQuick('What is the election timeline?')"><span class="chip-icon">📅</span>Election timeline</button>
      <button class="topic-chip" onclick="askQuick('What documents do I need?')"><span class="chip-icon">📄</span>Required documents</button>
    </div>
    <p class="welcome-hint">⌨️ Type below or tap a topic to begin</p>
  `;
  container.appendChild(welcome);

  closeConfirm();
  showToast('Chat history cleared');
}

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
function showToast(msg) {
  const t       = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ============================================================
   BACKGROUND CANVAS — ANIMATED PARTICLES + GRID
   ============================================================ */
function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles = [];

  /* Resize canvas to viewport */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  /* Individual floating particle */
  class Particle {
    constructor() { this.reset(true); }

    reset(init) {
      this.x     = Math.random() * W;
      this.y     = init ? Math.random() * H : H + 10;
      this.r     = Math.random() * 1.5 + 0.3;
      this.vx    = (Math.random() - 0.5) * 0.3;
      this.vy    = -(Math.random() * 0.5 + 0.1);
      this.alpha = Math.random() * 0.5 + 0.1;
      this.color = Math.random() > 0.6
        ? `rgba(99,102,241,${this.alpha})`
        : Math.random() > 0.5
          ? `rgba(245,158,11,${this.alpha * 0.7})`
          : `rgba(148,163,196,${this.alpha * 0.5})`;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10) this.reset(false);
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  function initParticles() {
    particles = Array.from({ length: 90 }, () => new Particle());
  }

  /* Subtle grid overlay */
  function drawGrid() {
    const isDark  = document.documentElement.getAttribute('data-theme') !== 'light';
    const alpha   = isDark ? 0.025 : 0.04;
    ctx.strokeStyle = `rgba(99,102,241,${alpha})`;
    ctx.lineWidth   = 0.5;
    const gridSize  = 60;

    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  /* Radial gradient atmosphere (dark mode only) */
  function drawBg() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    if (!isDark) return;

    const g1 = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.7);
    g1.addColorStop(0, 'rgba(37,99,255,0.06)');
    g1.addColorStop(1, 'rgba(6,13,31,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(W * 0.8, H * 0.8, 0, W * 0.8, H * 0.8, W * 0.5);
    g2.addColorStop(0, 'rgba(124,58,237,0.05)');
    g2.addColorStop(1, 'rgba(6,13,31,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }

  /* Main animation loop */
  function animate() {
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    drawBg();
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => { resize(); initParticles(); });
  resize();
  initParticles();
  animate();
}