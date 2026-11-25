/* =====================================================================
   📦 ARCHIVAR FOTOS (solo administrador) · v5.32
   Baja las fotos/videos viejos en ZIP (por tandas) y recién después libera el espacio en Supabase.
   Las fotos no se rompen: se reemplazan por una imagen chica "Foto archivada" en la misma ruta.
   ===================================================================== */
const ARC = { all: [], sel: [], busy: false };
const ARC_IMG = /\.(jpe?g|png|webp|gif)$/i, ARC_VID = /\.(mp4|webm|mov|m4v)$/i, ARC_PDF = /\.pdf$/i;
const arcMB = b => (b / 1048576).toFixed(b >= 1.05e8 ? 0 : 1) + ' MB';
const arcSafe = p => String(p).split('/').filter(x => x && x !== '.' && x !== '..').join('/').replace(/[\\:*?"<>|]/g, '_');

async function arcList(onProg, prefix = '', depth = 0, out = []){
  if (depth > 8 || out.length > 60000) return out;
  for (let off = 0; ; off += 1000){
    const { data, error } = await sb.storage.from('fotos').list(prefix, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error; if (!data?.length) break;
    for (const e of data){
      const path = prefix ? prefix + '/' + e.name : e.name;
      if (e.id === null || e.id === undefined) await arcList(onProg, path, depth + 1, out);
      else out.push({ path, size: Number(e.metadata?.size || 0), at: String(e.created_at || e.updated_at || '').slice(0, 10) });
    }
    onProg?.(out.length); if (data.length < 1000) break;
  }
  return out;
}
function arcPlaceholder(){
  return new Promise(ok => { const c = document.createElement('canvas'); c.width = 480; c.height = 320; const g = c.getContext('2d');
    g.fillStyle = '#E2E8F0'; g.fillRect(0, 0, 480, 320); g.fillStyle = '#475569'; g.textAlign = 'center';
    g.font = 'bold 28px sans-serif'; g.fillText('📦 Foto archivada', 240, 150); g.font = '16px sans-serif'; g.fillText('Respaldo guardado fuera de la app', 240, 186);
    c.toBlob(b => ok(b), 'image/jpeg', 0.6); });
}
async function arcOpen(){
  if (!isAdmin()) return toast('Solo el administrador puede archivar fotos.');
  if (!needOnline()) return;
  try { await needLib('jszip'); } catch (e){ return toast(errText(e)); }
  const lim = new Date(); lim.setMonth(lim.getMonth() - 3);
  const m = modal(`<h2>📦 Archivar fotos</h2>
    <p class="muted sm" style="margin-top:0">1) Buscás lo anterior a una fecha · 2) bajás cada tanda en ZIP a tu computadora · 3) <b>recién cuando confirmás</b> que la tenés, se libera el espacio en Supabase. Las fotos quedan reemplazadas por una imagen "Foto archivada", no se rompen.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:end"><div><label>Archivar lo anterior al</label><input type="date" id="ar-d" value="${dStr(lim)}" style="width:auto"></div>
      <div><label>Tamaño de cada ZIP</label><select id="ar-t" style="width:auto"><option value="100">100 MB</option><option value="150" selected>150 MB</option><option value="250">250 MB</option></select></div>
      <button class="btn" id="ar-go">Buscar</button></div>
    <div class="row" style="gap:14px;flex-wrap:wrap;margin-top:6px"><label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="ar-v" checked style="width:auto"> Incluir videos (se eliminan, no tienen reemplazo)</label>
      <label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="ar-p" style="width:auto"> Incluir PDF (se eliminan; los links a esos PDF dejan de abrir)</label></div>
    <div id="ar-out" style="margin-top:10px"></div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sec" id="ar-x">Cerrar</button></div>`, { wide: true });
  $('#ar-x').onclick = () => { if (ARC.busy && !confirm('Hay una descarga en curso. ¿Cerrar igual?')) return; m.close(); };
  $('#ar-go').onclick = async () => {
    const out = $('#ar-out'); out.innerHTML = '<p class="muted">Buscando archivos…</p>'; $('#ar-go').disabled = true;
    try {
      if (!ARC.all.length) ARC.all = await arcList(n => { out.innerHTML = `<p class="muted">Buscando archivos… ${n}</p>`; });
      const to = $('#ar-d').value, vid = $('#ar-v').checked, pdf = $('#ar-p').checked;
      ARC.sel = ARC.all.filter(f => f.at && f.at <= to && ((ARC_IMG.test(f.path) && f.size > 25000) || (vid && ARC_VID.test(f.path)) || (pdf && ARC_PDF.test(f.path)))).sort((a, b) => a.at < b.at ? -1 : 1);
      ARC.mb = Number($('#ar-t').value) * 1048576; ARC.batch = 0; ARC.freed = 0;
      const tot = ARC.sel.reduce((a, f) => a + f.size, 0), all = ARC.all.reduce((a, f) => a + f.size, 0), by = {};
      ARC.sel.forEach(f => { const k = f.at.slice(0, 7); by[k] = by[k] || { n: 0, b: 0 }; by[k].n++; by[k].b += f.size; });
      out.innerHTML = `<p><b>${ARC.sel.length}</b> archivos hasta el ${esc(fmtD(to))}: <b>${arcMB(tot)}</b> (de ${arcMB(all)} en total en el almacenamiento).</p>
        <div class="tblwrap" style="max-height:22vh;overflow:auto"><table class="tbl"><thead><tr><th>Mes</th><th class="num">Archivos</th><th class="num">Tamaño</th></tr></thead><tbody>${Object.entries(by).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${arcMB(v.b)}</td></tr>`).join('')}</tbody></table></div>
        ${ARC.sel.length ? '<div id="ar-run" style="margin-top:10px"></div>' : '<p class="muted">No hay nada para archivar con esos filtros.</p>'}`;
      if (ARC.sel.length) arcNext();
    } catch (e){ out.innerHTML = `<div class="err">${esc(/not found|policy|permission|row-level/i.test(errText(e)) ? 'No tengo permiso para listar el almacenamiento (' + errText(e) + ').' : errText(e))}</div>`; }
    $('#ar-go').disabled = false;
  };
  // si cambia fecha/filtros hay que volver a buscar
  ['ar-d', 'ar-v', 'ar-p', 'ar-t'].forEach(id => $('#' + id).addEventListener('change', () => { $('#ar-out').innerHTML = ''; }));
}
function arcNext(){
  const box = $('#ar-run'); if (!box) return;
  if (!ARC.sel.length) return void (box.innerHTML = `<div class="banner trial"><span class="dot"></span><div><b>✔ Listo.</b> Se liberaron ${arcMB(ARC.freed)}. Revisá el uso en Supabase (Settings → Usage); puede tardar un rato en actualizarse.</div></div>`);
  let b = [], s = 0; for (const f of ARC.sel){ if (b.length && s + f.size > ARC.mb) break; b.push(f); s += f.size; }
  ARC.cur = b; ARC.batch++;
  box.innerHTML = `<div class="card" style="margin:0"><b>Tanda ${ARC.batch}</b> · ${b.length} archivos · ${arcMB(s)} · del ${esc(fmtD(b[0].at))} al ${esc(fmtD(b[b.length - 1].at))}
    <div class="row" style="gap:6px;margin-top:8px"><button class="btn" id="ar-dl">⬇ Bajar esta tanda (ZIP)</button></div><div id="ar-st" class="sm muted" style="margin-top:6px"></div></div>`;
  $('#ar-dl').onclick = () => arcDownload(b, s);
}
async function arcDownload(b, size){
  ARC.busy = true; const st = $('#ar-st'); $('#ar-dl').disabled = true;
  const zip = new JSZip(), ok = [], bad = []; let done = 0, i = 0;
  const worker = async () => { while (i < b.length){ const f = b[i++]; try {
      const { data, error } = await sb.storage.from('fotos').download(f.path); if (error || !data) throw error || new Error('vacío');
      if (f.size && Math.abs(data.size - f.size) > Math.max(2048, f.size * 0.02)) throw new Error('tamaño distinto');
      zip.file(arcSafe(f.path), data, { binary: true, compression: 'STORE' }); ok.push(f);
    } catch (e){ bad.push(f); } done++; st.textContent = `Descargando ${done} de ${b.length}…`; } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  ARC.busy = false;
  if (!ok.length){ st.innerHTML = '<span style="color:var(--red)">No se pudo bajar ningún archivo. Revisá la conexión.</span>'; $('#ar-dl').disabled = false; return; }
  zip.file('LEEME_manifiesto.csv', '﻿ruta,fecha,bytes\n' + ok.map(f => [arcSafe(f.path), f.at, f.size].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n'));
  st.textContent = 'Armando el ZIP…';
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, md => { st.textContent = `Armando el ZIP… ${Math.round(md.percent)}%`; });
  const name = `Archivo fotos - parte ${String(ARC.batch).padStart(2, '0')} (${ok[0].at} a ${ok[ok.length - 1].at}).zip`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  const mb = ok.reduce((x, f) => x + f.size, 0);
  st.innerHTML = `<div class="banner warn" style="margin:8px 0 0"><span class="dot"></span><div style="flex:1"><b>Se bajó "${esc(name)}"</b> (${ok.length} archivos, ${arcMB(mb)}).${bad.length ? ` <b style="color:var(--red)">${bad.length} no se pudieron bajar y NO se van a borrar.</b>` : ''}
      <div class="sm">Antes de seguir: buscalo en Descargas, <b>abrilo y mirá que las fotos se vean</b>, y guardalo también en un segundo lugar. Si no lo tenés, no confirmes.</div>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn danger" id="ar-ok">Ya lo tengo y se ve bien: liberar espacio</button><button class="btn sec" id="ar-re">Bajar de nuevo</button></div></div></div>`;
  $('#ar-re').onclick = () => { ARC.batch--; arcNext(); };
  $('#ar-ok').onclick = () => arcFree(ok, bad, mb);
}
async function arcFree(ok, bad, mb){
  if (!confirm(`Se van a liberar ${ok.length} archivos (${arcMB(mb)}) de Supabase. Las fotos quedarán como "Foto archivada". Esto no se puede deshacer.\n\n¿Confirmás que ya tenés el ZIP?`)) return;
  const st = $('#ar-st'); $('#ar-ok').disabled = true; $('#ar-re').disabled = true; ARC.busy = true;
  const ph = await arcPlaceholder(); let n = 0, fail = 0; const toRemove = [];
  for (const f of ok){
    if (ARC_IMG.test(f.path)){ const { error } = await sb.storage.from('fotos').upload(f.path, ph, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' }); if (error) toRemove.push(f); else n++; }
    else toRemove.push(f);
    st.textContent = `Liberando… ${n + toRemove.length} de ${ok.length}`;
  }
  for (let i = 0; i < toRemove.length; i += 100){ const { error } = await sb.storage.from('fotos').remove(toRemove.slice(i, i + 100).map(f => f.path)); if (error) fail += Math.min(100, toRemove.length - i); else n += Math.min(100, toRemove.length - i); }
  ARC.busy = false;
  const done = new Set(ok.map(f => f.path)); ARC.sel = ARC.sel.filter(f => !done.has(f.path)); ARC.freed += mb;
  if (fail) toast(`${fail} archivos no se pudieron borrar; probá de nuevo.`);
  toast(`Liberados ${arcMB(mb)}`); arcNext();
}
