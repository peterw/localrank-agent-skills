#!/usr/bin/env node
/**
 * LocalRank CLI - AI Agent Interface
 *
 * Track local rankings, run audits, and manage SEO clients through AI agents.
 * Requires Node.js 18+ (uses built-in fetch).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const API_BASE = process.env.LOCALRANK_API_URL || 'https://api.localrank.so';
const CONFIG_PATHS = {
  global: path.join(os.homedir(), '.config', 'localrank', 'config.json'),
  local: path.join(process.cwd(), '.localrank', 'config.json')
};

// ============================================================================
// Config Management
// ============================================================================

function loadConfig() {
  // Priority: env var > local > global
  if (process.env.LOCALRANK_API_KEY) {
    return { api_key: process.env.LOCALRANK_API_KEY };
  }

  for (const configPath of [CONFIG_PATHS.local, CONFIG_PATHS.global]) {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      // Continue to next config
    }
  }
  return {};
}

function saveConfig(config, location = 'global') {
  const configPath = CONFIG_PATHS[location];
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function getApiKey() {
  const config = loadConfig();
  return config.api_key;
}

// ============================================================================
// API Client
// ============================================================================

async function apiGet(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key not found. Run: localrank setup');
  }

  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const resp = await fetch(url.toString(), {
    headers: { 'Authorization': `Api-Key ${apiKey}` }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API Error ${resp.status}: ${text}`);
  }

  return resp.json();
}

async function apiPost(endpoint, data = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key not found. Run: localrank setup');
  }

  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Api-Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API Error ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ============================================================================
// Commands
// ============================================================================

const commands = {
  // Setup & Config
  async setup(args) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (q) => new Promise(resolve => rl.question(q, resolve));

    console.log('\n🔧 LocalRank Setup\n');
    console.log('Get your API key at: https://app.localrank.so/settings/api\n');

    const apiKey = args['--key'] || await question('API Key: ');
    const location = args['--location'] || 'global';

    if (!apiKey || !apiKey.startsWith('lr_')) {
      console.error('❌ Invalid API key. Keys start with "lr_"');
      rl.close();
      process.exit(1);
    }

    // Verify the key works
    process.env.LOCALRANK_API_KEY = apiKey;
    try {
      await apiGet('/api/businesses/', { page_size: 1 });
    } catch (e) {
      console.error('❌ API key verification failed:', e.message);
      rl.close();
      process.exit(1);
    }

    const configPath = saveConfig({ api_key: apiKey }, location);
    console.log(`\n✅ Config saved to: ${configPath}`);
    console.log('You can now use LocalRank commands!\n');

    rl.close();
  },

  async 'config:show'() {
    const config = loadConfig();
    const source = process.env.LOCALRANK_API_KEY ? 'environment variable' :
      fs.existsSync(CONFIG_PATHS.local) ? 'local config' : 'global config';

    console.log(JSON.stringify({
      api_key: config.api_key ? `${config.api_key.slice(0, 8)}...` : null,
      source,
      api_base: API_BASE
    }, null, 2));
  },

  // Business/Client Management
  async 'businesses:list'(args) {
    const data = await apiGet('/api/businesses/');
    const results = data.results || data;

    let businesses = results.map(b => ({
      uuid: b.uuid,
      name: b.name,
      place_id: b.place_id
    }));

    // Filter by search if provided
    const search = args['--search']?.toLowerCase();
    if (search) {
      businesses = businesses.filter(b => b.name.toLowerCase().includes(search));
    }

    console.log(JSON.stringify({ businesses, count: businesses.length }, null, 2));
  },

  // Scans & Rankings
  async 'scans:list'(args) {
    const limit = Math.min(parseInt(args['--limit']) || 10, 50);
    const data = await apiGet('/api/scans/', { page_size: limit });
    const results = data.results || [];

    let scans = results.map(s => ({
      uuid: s.uuid,
      business_name: s.business?.name,
      keywords: s.keywords,
      status: s.status,
      avg_rank: s.avg_rank,
      created_at: s.created_at,
      view_url: s.public_share_token ? `https://app.localrank.so/share/${s.public_share_token}` : null
    }));

    // Filter by business name
    const businessFilter = args['--business']?.toLowerCase();
    if (businessFilter) {
      scans = scans.filter(s => s.business_name?.toLowerCase().includes(businessFilter));
    }

    console.log(JSON.stringify({ scans, count: scans.length }, null, 2));
  },

  async 'scans:get'(args) {
    const scanId = args._[0];
    if (!scanId) {
      console.error('Usage: localrank scans:get <scan_id>');
      process.exit(1);
    }

    const data = await apiGet(`/api/scans/${scanId}/`);
    const keywords = (data.keyword_results || []).map(kw => ({
      keyword: kw.keyword,
      avg_rank: kw.avg_rank,
      best_rank: kw.best_rank,
      found_count: kw.found_count
    }));

    console.log(JSON.stringify({
      uuid: data.uuid,
      business_name: data.business?.name,
      status: data.status,
      avg_rank: data.avg_rank,
      keywords,
      view_url: data.public_share_token ? `https://app.localrank.so/share/${data.public_share_token}` : null
    }, null, 2));
  },

  // Client Reports
  async 'client:report'(args) {
    const businessName = args['--business'] || args._[0];
    if (!businessName) {
      console.error('Usage: localrank client:report --business "Business Name"');
      process.exit(1);
    }

    const searchTerm = businessName.toLowerCase();
    const data = await apiGet('/api/scans/', { page_size: 50 });
    const results = data.results || [];
    const clientScans = results.filter(s =>
      s.business?.name?.toLowerCase().includes(searchTerm)
    );

    if (clientScans.length === 0) {
      console.log(JSON.stringify({ error: `No scans found for '${businessName}'` }, null, 2));
      return;
    }

    const latest = clientScans[0];
    const latestDetail = await apiGet(`/api/scans/${latest.uuid}/`);

    const report = {
      business_name: latest.business?.name,
      latest_scan: {
        date: latestDetail.created_at,
        avg_rank: latestDetail.avg_rank,
        keywords: (latestDetail.keyword_results || []).map(kw => ({
          keyword: kw.keyword,
          avg_rank: kw.avg_rank,
          best_rank: kw.best_rank
        }))
      },
      wins: [],
      drops: [],
      total_scans: clientScans.length
    };

    // Compare with previous scan
    if (clientScans.length >= 2) {
      const previousDetail = await apiGet(`/api/scans/${clientScans[1].uuid}/`);
      const prevKwRanks = {};
      (previousDetail.keyword_results || []).forEach(kw => {
        prevKwRanks[kw.keyword] = kw.avg_rank;
      });

      (latestDetail.keyword_results || []).forEach(kw => {
        const prev = prevKwRanks[kw.keyword];
        const current = kw.avg_rank;
        if (prev && current) {
          const change = prev - current;
          if (change > 0) {
            report.wins.push({ keyword: kw.keyword, from: prev, to: current, improved_by: Math.round(change * 10) / 10 });
          } else if (change < 0) {
            report.drops.push({ keyword: kw.keyword, from: prev, to: current, dropped_by: Math.round(Math.abs(change) * 10) / 10 });
          }
        }
      });
    }

    if (latestDetail.public_share_token) {
      report.view_url = `https://app.localrank.so/share/${latestDetail.public_share_token}`;
    }

    console.log(JSON.stringify(report, null, 2));
  },

  // Portfolio & Agency Tools
  async 'portfolio:summary'() {
    const data = await apiGet('/api/scans/', { page_size: 100 });
    const results = data.results || [];

    const byBusiness = {};
    results.forEach(scan => {
      const name = scan.business?.name || 'Unknown';
      if (!byBusiness[name]) byBusiness[name] = [];
      byBusiness[name].push(scan);
    });

    const summary = {
      total_clients: Object.keys(byBusiness).length,
      total_scans: results.length,
      improving: 0,
      declining: 0,
      stable: 0,
      clients: []
    };

    let totalRank = 0, rankCount = 0;

    Object.entries(byBusiness).forEach(([name, scans]) => {
      const latest = scans[0];
      const avgRank = latest.avg_rank;

      if (avgRank) {
        totalRank += avgRank;
        rankCount++;
      }

      let status = 'new', change = null;
      if (scans.length >= 2) {
        const prev = scans[1].avg_rank;
        if (avgRank && prev) {
          change = prev - avgRank;
          if (change > 0.5) { status = 'improving'; summary.improving++; }
          else if (change < -0.5) { status = 'declining'; summary.declining++; }
          else { status = 'stable'; summary.stable++; }
        }
      }

      summary.clients.push({
        name,
        status,
        avg_rank: avgRank ? Math.round(avgRank * 10) / 10 : null,
        change: change ? Math.round(change * 10) / 10 : null,
        view_url: latest.public_share_token ? `https://app.localrank.so/share/${latest.public_share_token}` : null
      });
    });

    summary.avg_rank_across_portfolio = rankCount > 0 ? Math.round((totalRank / rankCount) * 10) / 10 : null;

    // Sort: declining first
    const order = { declining: 0, improving: 1, stable: 2, new: 3 };
    summary.clients.sort((a, b) => order[a.status] - order[b.status]);

    console.log(JSON.stringify(summary, null, 2));
  },

  async 'prioritize:today'() {
    const data = await apiGet('/api/scans/', { page_size: 100 });
    const results = data.results || [];

    const byBusiness = {};
    results.forEach(scan => {
      const name = scan.business?.name || 'Unknown';
      if (!byBusiness[name]) byBusiness[name] = [];
      byBusiness[name].push(scan);
    });

    const priorities = { urgent: [], important: [], quick_wins: [] };

    for (const [name, scans] of Object.entries(byBusiness)) {
      const latest = scans[0];
      const avgRank = latest.avg_rank;

      // Urgent: big drops
      if (scans.length >= 2) {
        const prev = scans[1].avg_rank;
        if (avgRank && prev && (avgRank - prev) > 3) {
          priorities.urgent.push({
            client: name,
            task: 'Investigate ranking drop',
            reason: `Dropped from ${Math.round(prev * 10) / 10} to ${Math.round(avgRank * 10) / 10}`
          });
        }
      }

      // Important: poor rankings
      if (avgRank && avgRank > 12) {
        priorities.important.push({
          client: name,
          task: 'Improve rankings',
          reason: `Average rank is ${Math.round(avgRank * 10) / 10}`
        });
      }

      // Quick wins: close to page 1
      const detail = await apiGet(`/api/scans/${latest.uuid}/`);
      for (const kw of (detail.keyword_results || [])) {
        if (kw.avg_rank && kw.avg_rank >= 11 && kw.avg_rank <= 15) {
          priorities.quick_wins.push({
            client: name,
            keyword: kw.keyword,
            current_rank: Math.round(kw.avg_rank * 10) / 10,
            positions_to_page_1: Math.round((kw.avg_rank - 10) * 10) / 10
          });
          break;
        }
      }
    }

    // Limit results
    Object.keys(priorities).forEach(k => priorities[k] = priorities[k].slice(0, 5));

    console.log(JSON.stringify({
      priorities,
      tip: 'Start with urgent items, then quick wins for momentum'
    }, null, 2));
  },

  async 'quick-wins:find'(args) {
    const businessFilter = args['--business']?.toLowerCase();
    const data = await apiGet('/api/scans/', { page_size: 100 });
    const results = data.results || [];

    let scans = results;
    if (businessFilter) {
      scans = scans.filter(s => s.business?.name?.toLowerCase().includes(businessFilter));
    }

    // Get latest per business
    const byBusiness = {};
    scans.forEach(scan => {
      const name = scan.business?.name || 'Unknown';
      if (!byBusiness[name]) byBusiness[name] = scan;
    });

    const quickWins = [];
    for (const [name, scan] of Object.entries(byBusiness)) {
      const detail = await apiGet(`/api/scans/${scan.uuid}/`);
      for (const kw of (detail.keyword_results || [])) {
        if (kw.avg_rank && kw.avg_rank >= 11 && kw.avg_rank <= 20) {
          quickWins.push({
            business_name: name,
            keyword: kw.keyword,
            current_rank: Math.round(kw.avg_rank * 10) / 10,
            positions_to_page_1: Math.round((kw.avg_rank - 10) * 10) / 10,
            opportunity: kw.avg_rank <= 15 ? 'High' : 'Medium'
          });
        }
      }
    }

    quickWins.sort((a, b) => a.current_rank - b.current_rank);

    console.log(JSON.stringify({
      quick_wins: quickWins.slice(0, 20),
      total: quickWins.length,
      tip: 'These keywords are close to page 1. A little push could get them there.'
    }, null, 2));
  },

  async 'at-risk:clients'() {
    const data = await apiGet('/api/scans/', { page_size: 100 });
    const results = data.results || [];

    const byBusiness = {};
    results.forEach(scan => {
      const name = scan.business?.name || 'Unknown';
      if (!byBusiness[name]) byBusiness[name] = [];
      byBusiness[name].push(scan);
    });

    const atRisk = [];
    Object.entries(byBusiness).forEach(([name, scans]) => {
      const latest = scans[0];
      const avgRank = latest.avg_rank;
      const riskFactors = [];
      let riskScore = 0;

      // Rankings dropped
      if (scans.length >= 2) {
        const prev = scans[1].avg_rank;
        if (avgRank && prev && (avgRank - prev) > 2) {
          riskFactors.push(`Rankings dropped from ${Math.round(prev * 10) / 10} to ${Math.round(avgRank * 10) / 10}`);
          riskScore += 3;
        }
      }

      // Poor rankings
      if (avgRank && avgRank > 15) {
        riskFactors.push(`Poor visibility (avg rank ${Math.round(avgRank * 10) / 10})`);
        riskScore += 2;
      }

      // Low engagement
      if (scans.length === 1) {
        riskFactors.push('Only 1 scan - low engagement');
        riskScore += 1;
      }

      if (riskScore > 0) {
        atRisk.push({
          business_name: name,
          risk_score: riskScore,
          risk_factors: riskFactors,
          action: 'Reach out proactively'
        });
      }
    });

    atRisk.sort((a, b) => b.risk_score - a.risk_score);

    console.log(JSON.stringify({
      at_risk_clients: atRisk,
      tip: 'Contact these clients before they churn'
    }, null, 2));
  },

  // GMB Audits
  async 'audit:run'(args) {
    const gmbUrl = args['--url'] || args._[0];
    if (!gmbUrl) {
      console.error('Usage: localrank audit:run --url "https://google.com/maps/place/..."');
      process.exit(1);
    }

    const data = await apiPost('/api/gmb/audit/run/', { gmb_url: gmbUrl });
    console.log(JSON.stringify({
      audit_id: data.audit_id,
      status: data.status,
      share_url: data.share_url,
      credits_deducted: data.credits_deducted,
      tip: 'Use audit:get to check results once completed'
    }, null, 2));
  },

  async 'audit:get'(args) {
    const auditId = args._[0];
    if (!auditId) {
      console.error('Usage: localrank audit:get <audit_id>');
      process.exit(1);
    }

    const data = await apiGet(`/api/gmb/audit/${auditId}/`);
    const result = {
      audit_id: data.audit_id,
      status: data.status,
      business_name: data.business_name
    };

    if (data.status === 'completed') {
      result.audit_score = data.audit_score;
      result.review_stats = data.review_stats;
      result.revenue_impact = data.revenue_impact;
      result.issues_identified = (data.issues_identified || []).slice(0, 10);
    }

    console.log(JSON.stringify(result, null, 2));
  },

  // Recommendations
  async 'recommendations:get'(args) {
    const businessName = args['--business'] || args._[0];
    if (!businessName) {
      console.error('Usage: localrank recommendations:get --business "Business Name"');
      process.exit(1);
    }

    const searchTerm = businessName.toLowerCase();
    const data = await apiGet('/api/scans/', { page_size: 50 });
    const results = data.results || [];
    const clientScans = results.filter(s =>
      s.business?.name?.toLowerCase().includes(searchTerm)
    );

    if (clientScans.length === 0) {
      console.log(JSON.stringify({
        error: `No data found for '${businessName}'`,
        recommendations: [{ action: 'Run first scan', product: 'Rank Tracker' }]
      }, null, 2));
      return;
    }

    const latest = clientScans[0];
    const avgRank = latest.avg_rank;
    const recommendations = [];

    if (avgRank > 10) {
      recommendations.push({
        action: 'Use SuperBoost',
        product: 'SuperBoost',
        reason: `Average rank is ${Math.round(avgRank * 10) / 10}. SuperBoost uses AI-powered GBP optimization.`
      });
    }

    if (avgRank > 5 && avgRank <= 10) {
      recommendations.push({
        action: 'Use LocalBoost',
        product: 'LocalBoost',
        reason: `Average rank is ${Math.round(avgRank * 10) / 10}. LocalBoost builds citations and backlinks.`
      });
    }

    if (latest.keywords?.length < 5) {
      recommendations.push({
        action: 'Track more keywords',
        product: 'Rank Tracker',
        reason: `Only tracking ${latest.keywords?.length || 0} keywords.`
      });
    }

    if (avgRank <= 5 && recommendations.length === 0) {
      recommendations.push({
        action: 'Maintain with LocalBoost',
        product: 'LocalBoost',
        reason: `Great rankings (avg ${Math.round(avgRank * 10) / 10})! Maintain authority.`
      });
    }

    console.log(JSON.stringify({
      business_name: latest.business?.name,
      current_avg_rank: avgRank ? Math.round(avgRank * 10) / 10 : null,
      recommendations
    }, null, 2));
  },

  // Email Drafts
  async 'email:draft'(args) {
    const businessName = args['--business'] || args._[0];
    if (!businessName) {
      console.error('Usage: localrank email:draft --business "Business Name"');
      process.exit(1);
    }

    const searchTerm = businessName.toLowerCase();
    const data = await apiGet('/api/scans/', { page_size: 50 });
    const results = data.results || [];
    const clientScans = results.filter(s =>
      s.business?.name?.toLowerCase().includes(searchTerm)
    );

    if (clientScans.length === 0) {
      console.log(JSON.stringify({ error: `No data found for '${businessName}'` }, null, 2));
      return;
    }

    const latest = clientScans[0];
    const name = latest.business?.name || businessName;
    const avgRank = latest.avg_rank;
    const token = latest.public_share_token;

    let change = '';
    if (clientScans.length >= 2) {
      const prev = clientScans[1].avg_rank;
      if (avgRank && prev) {
        const diff = prev - avgRank;
        if (diff > 0) change = `Rankings improved by ${Math.round(diff * 10) / 10} positions!`;
        else if (diff < 0) change = `Rankings dropped by ${Math.round(Math.abs(diff) * 10) / 10} positions - we're working on recovery.`;
      }
    }

    const email = `Subject: ${name} - Monthly SEO Update

Hi,

Here's your monthly local SEO update for ${name}.

**Current Performance:**
- Average Local Rank: #${avgRank ? Math.round(avgRank * 10) / 10 : 'N/A'}
- Keywords Tracked: ${latest.keywords?.length || 0}
${change ? `\n**This Period:** ${change}` : ''}
${token ? `\n**View Your Ranking Map:** https://app.localrank.so/share/${token}` : ''}

Let me know if you have any questions!

Best regards`;

    console.log(JSON.stringify({
      business_name: name,
      email_draft: email
    }, null, 2));
  },

  // Help
  async help() {
    console.log(`
LocalRank CLI - AI Agent Interface

SETUP:
  localrank setup                     Configure API key (interactive)
  localrank setup --key lr_xxx        Configure API key (non-interactive)
  localrank config:show               Show current configuration

CLIENTS:
  localrank businesses:list           List all tracked businesses
  localrank businesses:list --search "name"  Search by name

RANKINGS:
  localrank scans:list                List recent scans
  localrank scans:list --business "name"  Filter by business
  localrank scans:get <scan_id>       Get scan details

REPORTS:
  localrank client:report --business "name"  Full client report with wins/drops
  localrank portfolio:summary         Overview of all clients
  localrank prioritize:today          What to work on today
  localrank quick-wins:find           Keywords close to page 1
  localrank at-risk:clients           Clients who might churn

AUDITS:
  localrank audit:run --url "google.com/maps/..."  Run GMB audit (500 credits)
  localrank audit:get <audit_id>      Get audit results

TOOLS:
  localrank recommendations:get --business "name"  How to help a client
  localrank email:draft --business "name"  Draft monthly update email

Get your API key at: https://app.localrank.so/settings/api
`);
  }
};

// ============================================================================
// CLI Parser
// ============================================================================

function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
    i++;
  }

  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    await commands.help();
    return;
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "localrank help" for usage');
    process.exit(1);
  }

  try {
    await handler(args);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
