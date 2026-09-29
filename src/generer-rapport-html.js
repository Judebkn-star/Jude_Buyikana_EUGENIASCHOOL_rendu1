// Rapport HTML autonome : styles inline, aucune ressource externe.
const d = $input.first().json;

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmtMontant = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: d.devise || 'EUR', maximumFractionDigits: 0,
}).format(n || 0);
const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

const S = {
  body: 'margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933;font-size:14px;line-height:1.45;',
  page: 'max-width:1040px;margin:0 auto;background:#ffffff;border:1px solid #e1e4e8;border-radius:8px;padding:28px;',
  h1: 'margin:0 0 4px;font-size:22px;',
  sous: 'margin:0 0 20px;color:#616e7c;',
  kpis: 'display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px;',
  kpi: 'flex:1 1 200px;border:1px solid #e1e4e8;border-radius:6px;padding:14px 16px;',
  kpiLabel: 'color:#616e7c;font-size:12px;text-transform:uppercase;letter-spacing:.04em;',
  kpiVal: 'font-size:22px;font-weight:600;margin-top:4px;',
  h2: 'font-size:17px;margin:32px 0 10px;padding-bottom:6px;border-bottom:2px solid #e1e4e8;',
  h3: 'font-size:14px;margin:20px 0 6px;',
  table: 'width:100%;border-collapse:collapse;margin-bottom:8px;',
  th: 'text-align:left;padding:7px 8px;background:#f0f2f5;border-bottom:1px solid #d5d9de;font-size:12px;color:#3e4c59;',
  td: 'padding:7px 8px;border-bottom:1px solid #eceef1;vertical-align:top;',
  num: 'text-align:right;white-space:nowrap;',
  tot: 'padding:7px 8px;font-weight:600;border-top:2px solid #d5d9de;',
  vide: 'padding:12px 14px;background:#f0f7f1;border:1px solid #cfe6d3;border-radius:6px;color:#256b33;',
  note: 'color:#616e7c;font-size:12px;margin-top:28px;',
};

const th = (t, num) => `<th style="${S.th}${num ? S.num : ''}">${t}</th>`;
const td = (t, num) => `<td style="${S.td}${num ? S.num : ''}">${t}</td>`;

// Section 1 : pipeline par étape (synthèse puis détail).
let pipeline;
if (d.nombre === 0) {
  pipeline = `<div style="${S.vide}">Aucune opportunité ouverte avec une clôture prévue ce trimestre fiscal.</div>`;
} else {
  const synth = d.parEtape.map((e) => `<tr>${td(esc(e.etape))}${td(e.nombre, true)}${td(fmtMontant(e.montant), true)}</tr>`).join('');
  const detail = d.parEtape.map((e) => `
    <h3 style="${S.h3}">${esc(e.etape)} · ${pluriel(e.nombre, 'opportunité')} · ${fmtMontant(e.montant)}</h3>
    <table style="${S.table}"><tr>${th('Opportunité')}${th('Compte')}${th('Propriétaire')}${th('Clôture prévue')}${th('Montant', true)}</tr>
    ${e.opportunites.map((o) => `<tr>${td(esc(o.nom))}${td(esc(o.compte))}${td(esc(o.proprietaire))}${td(fmtDate(o.dateCloture))}${td(o.montantRenseigne ? fmtMontant(o.montant) : '<em>non renseigné</em>', true)}</tr>`).join('')}
    </table>`).join('');
  pipeline = `
    <table style="${S.table}"><tr>${th('Étape')}${th('Opportunités', true)}${th('Montant', true)}</tr>${synth}
    <tr><td style="${S.tot}">Total</td><td style="${S.tot}${S.num}">${d.nombre}</td><td style="${S.tot}${S.num}">${fmtMontant(d.total)}</td></tr></table>
    ${detail}`;
}

// Section 2 : alertes « en retard ».
const retard = d.alertesRetard.length === 0
  ? `<div style="${S.vide}">Aucune alerte</div>`
  : `<table style="${S.table}"><tr>${th('Opportunité')}${th('Compte')}${th('Propriétaire')}${th('Étape')}${th('Clôture prévue')}${th('Motif')}${th('Montant', true)}</tr>
    ${d.alertesRetard.map((o) => `<tr>${td(esc(o.nom))}${td(esc(o.compte))}${td(esc(o.proprietaire))}${td(esc(o.etape))}${td(fmtDate(o.dateCloture))}${td(o.motifs.map(esc).join('<br>'))}${td(fmtMontant(o.montant), true)}</tr>`).join('')}</table>`;

// Section 3 : alertes « sans activité ».
const inactivite = d.alertesInactivite.length === 0
  ? `<div style="${S.vide}">Aucune alerte</div>`
  : `<table style="${S.table}"><tr>${th('Opportunité')}${th('Compte')}${th('Propriétaire')}${th('Étape')}${th('Dernière activité')}${th('Jours sans activité', true)}${th('Montant', true)}</tr>
    ${d.alertesInactivite.map((o) => `<tr>${td(esc(o.nom))}${td(esc(o.compte))}${td(esc(o.proprietaire))}${td(esc(o.etape))}${td(o.jamaisActivite ? '<em>aucune activité enregistrée</em>' : fmtDate(o.derniereActivite))}${td(o.joursSansActivite, true)}${td(fmtMontant(o.montant), true)}</tr>`).join('')}</table>`;

const titre = `Pipeline commercial du ${fmtDate(d.dateReference)}`;
const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title></head>
<body style="${S.body}"><div style="${S.page}">
<h1 style="${S.h1}">${titre}</h1>
<p style="${S.sous}">Opportunités ouvertes dont la clôture est prévue sur le trimestre fiscal en cours.</p>
<div style="${S.kpis}">
  <div style="${S.kpi}"><div style="${S.kpiLabel}">Montant total</div><div style="${S.kpiVal}">${fmtMontant(d.total)}</div></div>
  <div style="${S.kpi}"><div style="${S.kpiLabel}">Opportunités</div><div style="${S.kpiVal}">${d.nombre}</div></div>
  <div style="${S.kpi}"><div style="${S.kpiLabel}">En retard</div><div style="${S.kpiVal}">${d.alertesRetard.length}</div></div>
  <div style="${S.kpi}"><div style="${S.kpiLabel}">Sans activité</div><div style="${S.kpiVal}">${d.alertesInactivite.length}</div></div>
</div>
<h2 style="${S.h2}">Pipeline par étape</h2>${pipeline}
<h2 style="${S.h2}">Alertes « en retard »</h2>
<p style="${S.sous}">Clôture prévue dépassée, ou même étape depuis plus de ${d.seuilRetard} jours.</p>${retard}
<h2 style="${S.h2}">Alertes « sans activité »</h2>
<p style="${S.sous}">Aucune activité (appel, email, tâche, réunion) depuis plus de ${d.seuilInactivite} jours. Sans activité enregistrée, le décompte part de la création de l'opportunité.</p>${inactivite}
<p style="${S.note}">${d.nombreSansMontant ? `${pluriel(d.nombreSansMontant, 'opportunité')} sans montant, comptée${d.nombreSansMontant > 1 ? 's' : ''} pour 0 dans les totaux. ` : ''}Source : Salesforce. Rapport généré automatiquement par n8n.</p>
</div></body></html>`;

const fichierNom = `rapport-pipeline-${d.dateReference}.html`;
return [{
  json: d,
  binary: {
    rapport: {
      data: Buffer.from(html, 'utf8').toString('base64'),
      mimeType: 'text/html',
      fileName: fichierNom,
      fileExtension: 'html',
    },
  },
}];
