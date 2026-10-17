(function(){
  'use strict';

  var SUPABASE_URL = 'https://xfopgujreivzolnzrbxf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmb3BndWpyZWl2em9sbnpyYnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI3NzAsImV4cCI6MjEwNzgwODc3MH0.hExSjr9Tkwl9oOdOTVt5_VLLex9gj4E4hKu5V6bBgZ4';
  var CODE_KEY = 'keshiji_sync_code';
  var CACHE_KEY = 'keshiji_local_cache';
  var SYNC_TEXT = {ok:'已同步', syncing:'同步中…', loading:'连接中…', error:'同步失败'};

  var state = { students: [] };
  var syncCode = null;
  try{ syncCode = localStorage.getItem(CODE_KEY); }catch(e){}
  var lastRecord = null;
  var opState = { id:null, type:null, qty:1 };
  var opMode = 'op';       // 'op' | 'form'
  var editingId = null;
  var currentStudentId = null;
  var toastTimer = null;
  var saveTimer = null;

  function el(id){ return document.getElementById(id); }
  function val(id){ var n=el(id); return n? n.value : ''; }
  function uid(){ return 'id'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmt(n){ return '¥' + Math.round(n).toLocaleString('zh-CN'); }
  function friendly(date){ var p=date.split('-'); return parseInt(p[1],10)+'月'+parseInt(p[2],10)+'日'; }
  function fmtMonth(m){ var p=m.split('-'); return p[0]+'年'+parseInt(p[1],10)+'月'; }

  /* ---------- 云端同步 ---------- */
  function supabaseRpc(fn, params){
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY},
      body: JSON.stringify(params || {})
    }).then(function(res){
      if(!res.ok) throw new Error('RPC '+res.status);
      return res.text();
    }).then(function(t){ return t ? JSON.parse(t) : null; });
  }
  function loadLocalCache(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY)); }catch(e){ return null; } }
  function saveLocalCache(){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify({students:state.students})); }catch(e){} }
  function setSync(s){ var n=el('syncIndicator'); if(n){ n.setAttribute('data-s', s); n.textContent = SYNC_TEXT[s] || s; } }

  function save(){
    saveLocalCache();
    clearTimeout(saveTimer);
    setSync('syncing');
    saveTimer = setTimeout(function(){
      supabaseRpc('save_doc', {p_code: syncCode, p_data:{students:state.students}})
        .then(function(){ setSync('ok'); })
        .catch(function(){ setSync('error'); });
    }, 600);
  }
  function loadFromCloud(){
    return supabaseRpc('get_doc', {p_code: syncCode}).then(function(doc){
      if(doc && doc.students && doc.students.length) state = {students: doc.students};
      else state = {students: []};
      saveLocalCache();
      return true;
    }).catch(function(){
      var c = loadLocalCache();
      if(c && c.students) state = {students: c.students};
      return false;
    });
  }

  /* ---------- 学生数据 ---------- */
  function student(id){ for(var i=0;i<state.students.length;i++) if(state.students[i].id===id) return state.students[i]; return null; }
  function remaining(s){
    return s.records.reduce(function(acc,r){
      if(r.type==='purchase') return acc+r.qty;
      if(r.type==='lesson') return acc-r.qty;
      return acc;
    },0);
  }
  function statusMeta(rem){
    if(rem<=0) return {label:'已用完', cls:'st-empty'};
    if(rem===1) return {label:'剩 1 节', cls:'st-crit'};
    if(rem===2) return {label:'该续费', cls:'st-warn'};
    return {label:'正常', cls:'st-ok'};
  }
  function lastRecordOf(s){ var last=null; s.records.forEach(function(r){ if(!last || r.date>last.date) last=r; }); return last; }
  function lastDate(s){ var l=lastRecordOf(s); return l? l.date : ''; }

  /* ---------- 渲染 ---------- */
  function renderAll(){ renderHeaderIncome(); renderAlerts(); renderList(); renderIncome(); }

  function renderHeaderIncome(){
    var d = computeMonth(today().slice(0,7));
    el('headerIncome').innerHTML = '本月课消 <b>'+fmt(d.income)+'</b>';
  }
  function renderAlerts(){
    var empty=[],crit=[],warn=[];
    state.students.forEach(function(s){
      var r=remaining(s);
      if(r<=0) empty.push(s.name);
      else if(r===1) crit.push(s.name);
      else if(r===2) warn.push(s.name);
    });
    var parts=[];
    if(empty.length) parts.push(alertSeg('已用完',empty,'st-empty'));
    if(crit.length) parts.push(alertSeg('剩 1 节',crit,'st-crit'));
    if(warn.length) parts.push(alertSeg('该续费',warn,'st-warn'));
    var band=el('alertBand');
    if(!parts.length){ band.classList.add('hidden'); return; }
    band.classList.remove('hidden');
    band.innerHTML = '<span class="alert-title">续费提醒</span>' + parts.join('');
  }
  function alertSeg(label,names,cls){
    return '<span class="alert-group"><span class="alert-label '+cls+'">'+label+'</span><span class="alert-names">'+names.join('、')+'</span></span>';
  }
  function renderList(){
    var list=el('studentList');
    var q=val('searchInput').trim();
    var sort=el('sortSelect').value;
    var arr=state.students.slice();
    if(q) arr=arr.filter(function(s){ return s.name.indexOf(q)>=0; });
    if(sort==='remaining') arr.sort(function(a,b){ return remaining(a)-remaining(b); });
    else if(sort==='name') arr.sort(function(a,b){ return a.name.localeCompare(b.name,'zh'); });
    else if(sort==='recent') arr.sort(function(a,b){ return (lastDate(b)>lastDate(a))?1:-1; });
    list.innerHTML = arr.map(rowHTML).join('') || '<li class="empty">'+(state.students.length?'没有匹配的学生':'还没有学生，点右上角「新增学生」开始')+'</li>';
  }
  function rowHTML(s){
    var rem=remaining(s), m=statusMeta(rem);
    return '<li class="student-row" data-id="'+s.id+'">'+
      '<button class="student-main" data-act="open">'+
        '<span class="avatar">'+s.name.charAt(0)+'</span>'+
        '<span><span class="s-name">'+s.name+'</span><span class="s-meta">'+s.price+' 元/节</span></span>'+
      '</button>'+
      '<span class="s-remaining '+m.cls+'">'+
        '<span class="s-num">'+rem+'</span><span class="s-unit">节</span>'+
        '<span class="s-status">'+m.label+'</span>'+
      '</span>'+
      '<span class="s-actions">'+
        '<button class="btn btn-ghost btn-sm" data-act="lesson">消课</button>'+
        '<button class="btn btn-ghost btn-sm" data-act="leave">请假</button>'+
        '<button class="btn btn-ghost btn-sm" data-act="purchase">购课</button>'+
      '</span>'+
    '</li>';
  }
  function renderIncome(){
    var mk = el('monthSelect').value;
    var d = computeMonth(mk);
    el('statIncome').textContent = fmt(d.income);
    el('statLessons').textContent = d.lessons+' 节';
    el('statLeaves').textContent = d.leaves+' 节';
    el('statPurchases').textContent = d.purchases+' 节';
    var arr=[]; Object.keys(d.byStudent).forEach(function(k){ arr.push(d.byStudent[k]); });
    arr.sort(function(a,b){ return b.income-a.income; });
    var max = arr.length? arr[0].income : 1;
    el('breakdownList').innerHTML = arr.map(function(x){
      var pct = Math.max(4, Math.round(x.income/max*100));
      return '<div class="bd-row">'+
        '<span class="bd-name">'+x.name+'</span>'+
        '<span class="bd-bar"><span class="bd-fill" style="width:'+pct+'%"></span></span>'+
        '<span class="bd-val">'+x.lessons+' 节 · '+fmt(x.income)+'</span>'+
      '</div>';
    }).join('') || '<p class="empty">这个月还没有消课记录</p>';
  }
  function computeMonth(mk){
    var out={lessons:0,leaves:0,purchases:0,income:0,byStudent:{}};
    state.students.forEach(function(s){
      s.records.forEach(function(r){
        if(r.date.slice(0,7)!==mk) return;
        if(r.type==='lesson'){
          out.lessons+=r.qty;
          var inc=r.qty*s.price; out.income+=inc;
          var b=out.byStudent[s.id]; if(!b){ b=out.byStudent[s.id]={name:s.name,lessons:0,income:0}; }
          b.lessons+=r.qty; b.income+=inc;
        } else if(r.type==='leave'){ out.leaves+=r.qty; }
        else if(r.type==='purchase'){ out.purchases+=r.qty; }
      });
    });
    return out;
  }
  function populateMonths(){
    var months={}; var cur=today().slice(0,7); months[cur]=1;
    state.students.forEach(function(s){ s.records.forEach(function(r){ months[r.date.slice(0,7)]=1; }); });
    var arr=Object.keys(months).sort();
    el('monthSelect').innerHTML = arr.map(function(m){ return '<option value="'+m+'">'+fmtMonth(m)+'</option>'; }).join('');
    el('monthSelect').value = cur;
  }

  /* ---------- 抽屉 ---------- */
  function openDrawer(id){ currentStudentId=id; renderDrawer(); el('drawer').classList.remove('hidden'); }
  function closeDrawer(){ el('drawer').classList.add('hidden'); }
  function renderDrawer(){
    var s=student(currentStudentId); if(!s) return;
    var rem=remaining(s), m=statusMeta(rem);
    el('drName').textContent=s.name;
    el('drPrice').textContent=s.price+' 元/节'+(s.note?(' · '+s.note):'');
    var num=el('drNum'); num.textContent=rem; num.className='dr-num '+m.cls;
    el('drStatus').textContent=m.label; el('drStatus').className='dr-status '+m.cls;
    var bal=0;
    var rows=[].concat(s.records).sort(function(a,b){ return a.date<b.date?-1:1; }).map(function(r){
      if(r.type==='purchase') bal+=r.qty;
      else if(r.type==='lesson') bal-=r.qty;
      var meta = r.type==='lesson' ? ['消课','r-lesson','− '+r.qty] : r.type==='leave' ? ['请假','r-leave','顺延'] : ['购课','r-purchase','+ '+r.qty];
      return '<li class="rec">'+
        '<span class="rec-date">'+friendly(r.date)+'</span>'+
        '<span class="rec-badge '+meta[1]+'">'+meta[0]+'</span>'+
        '<span class="rec-qty">'+meta[2]+'</span>'+
        '<span class="rec-bal">余 '+bal+' 节</span>'+
      '</li>';
    }).reverse().join('');
    el('drRecords').innerHTML = rows || '<li class="rec-empty">暂无记录，点上方按钮开始记账</li>';
  }

  /* ---------- 操作弹窗 ---------- */
  function openOp(id,type){
    var s=student(id); if(!s) return;
    opMode='op'; opState={id:id,type:type,qty:(type==='purchase'?10:1)};
    var titles={lesson:'消课',leave:'请假',purchase:'购买课时'};
    el('opTitle').textContent=titles[type];
    el('opStudent').textContent=s.name+' · 剩余 '+remaining(s)+' 节';
    el('opBody').innerHTML = opBodyHTML(type, remaining(s));
    el('opConfirm').textContent = type==='lesson'?'确认消课':type==='leave'?'确认请假':'确认购买';
    el('modal').classList.remove('hidden');
  }
  function opBodyHTML(type,rem){
    if(type==='purchase'){
      return '<div class="field"><label>选择课时包</label>'+
        '<div class="chip-row"><button class="chip active" data-qty="10">+10 节</button><button class="chip" data-qty="20">+20 节</button></div></div>'+
        '<div class="field"><label>或自定义节数</label><input id="opQty" type="number" min="1" value="10"></div>'+
        '<div class="op-preview" id="opPreview">'+rem+' 节 → <b>'+(rem+10)+' 节</b></div>';
    }
    var qtyUI='<div class="field"><label>本次节数</label>'+
      '<div class="seg" id="opSeg">'+
      '<button class="seg-btn active" data-qty="1">1 节</button>'+
      '<button class="seg-btn" data-qty="2">2 节</button>'+
      '</div></div>';
    if(type==='lesson'){
      return qtyUI+
        '<div class="op-preview" id="opPreview">'+rem+' 节 → <b>'+(rem-1)+' 节</b></div>'+
        '<div class="field"><label>备注（可选）</label><input id="opNote" placeholder="如：调课、补课"></div>';
    }
    return qtyUI+
      '<div class="op-preview muted" id="opPreview">不扣课时，课时顺延 · '+rem+' 节 → <b>'+rem+' 节</b></div>'+
      '<div class="field"><label>备注（可选）</label><input id="opNote" placeholder="如：病假、事假"></div>';
  }
  function refreshPreview(){
    var prev=el('opPreview'); if(!prev) return;
    var s=student(opState.id); if(!s) return;
    var rem=remaining(s), q=opState.qty||0;
    if(opState.type==='lesson') prev.innerHTML = rem+' 节 → <b>'+(rem-q)+' 节</b>';
    else if(opState.type==='leave') prev.innerHTML = '不扣课时，课时顺延 · '+rem+' 节 → <b>'+rem+' 节</b>';
    else prev.innerHTML = rem+' 节 → <b>'+(rem+q)+' 节</b>';
  }
  function submitOp(){
    var s=student(opState.id); var qty=opState.qty;
    if(!s || !qty || qty<=0) return;
    var note=val('opNote').trim();
    applyOp(s.id, opState.type, qty, note);
    closeModal();
    var label = opState.type==='lesson'?'已消课':opState.type==='leave'?'已请假':'已购课';
    var tail = opState.type==='leave'?' · 课时顺延':(' · '+s.name+'剩余 '+remaining(s)+' 节');
    toast(label+' '+qty+' 节'+tail, true);
  }
  function applyOp(id,type,qty,note){
    var s=student(id);
    var rec={id:uid(),date:today(),type:type,qty:qty,note:note||''};
    s.records.push(rec);
    lastRecord={studentId:id, recordId:rec.id};
    save(); renderAll();
  }
  function undoLast(){
    if(!lastRecord) return;
    var s=student(lastRecord.studentId);
    if(s) s.records=s.records.filter(function(r){ return r.id!==lastRecord.recordId; });
    lastRecord=null; save(); renderAll();
  }

  /* ---------- 新增/编辑学生 ---------- */
  function openForm(id){
    var s = id? student(id): null;
    opMode='form'; editingId=id;
    el('opTitle').textContent = s?'编辑学生':'新增学生';
    el('opStudent').textContent = s?'修改后即时生效':'';
    el('opBody').innerHTML =
      '<div class="field"><label>姓名</label><input id="fName" value="'+(s?s.name:'')+'" placeholder="学生姓名"></div>'+
      '<div class="field"><label>课时单价（元/节）</label><input id="fPrice" type="number" min="0" value="'+(s?s.price:'')+'" placeholder="如 120"></div>'+
      (s?'':'<div class="field"><label>初始课时（可选）</label><input id="fInit" type="number" min="0" value="0"></div>')+
      '<div class="field"><label>备注（可选）</label><input id="fNote" value="'+(s?(s.note||''):'')+'" placeholder="如：家长偏好"></div>';
    el('opConfirm').textContent = s?'保存':'添加';
    el('modal').classList.remove('hidden');
  }
  function submitForm(){
    var name=val('fName').trim();
    var price=parseFloat(val('fPrice'));
    if(!name){ alert('请填写学生姓名'); return; }
    if(isNaN(price)||price<0){ alert('请填写正确的课时单价'); return; }
    if(editingId){
      var s=student(editingId); s.name=name; s.price=price; s.note=val('fNote').trim();
    } else {
      var init=parseInt(val('fInit')||'0',10)||0;
      var ns={id:uid(),name:name,price:price,note:val('fNote').trim(),records:[]};
      if(init>0) ns.records.push({id:uid(),date:today(),type:'purchase',qty:init});
      state.students.push(ns);
    }
    save(); renderAll(); closeModal();
    toast(editingId?'已保存':'已添加学生 '+name, false);
  }

  /* ---------- 弹窗 / Toast ---------- */
  function closeModal(){ el('modal').classList.add('hidden'); }
  function toast(msg,withUndo){
    var t=el('toast');
    t.innerHTML='<span>'+msg+'</span>'+(withUndo?'<button class="undo" id="undoBtn">撤销</button>':'');
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){ t.classList.add('hidden'); }, 5000);
    if(withUndo) el('undoBtn').addEventListener('click', function(){ undoLast(); t.classList.add('hidden'); });
  }

  /* ---------- 登录 / 同步码 ---------- */
  function showLogin(){ el('login').classList.remove('hidden'); el('app').classList.add('hidden'); }
  function showApp(){
    el('login').classList.add('hidden'); el('app').classList.remove('hidden');
    populateMonths(); renderAll();
  }
  function genCode(){
    var A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function g(n){ var s=''; for(var i=0;i<n;i++) s+=A.charAt(Math.floor(Math.random()*A.length)); return s; }
    return 'KSHJ-'+g(4)+'-'+g(4)+'-'+g(4);
  }
  function enterCode(){
    var code = val('codeInput').trim();
    if(!code){ alert('请输入或生成一个同步码'); return; }
    var btn = el('codeBtn');
    btn.disabled = true; btn.textContent = '连接中…';
    supabaseRpc('get_doc', {p_code: code}).then(function(doc){
      var hasData = doc && doc.students && doc.students.length;
      if(!hasData && !confirm('没有找到这个同步码的数据。\n\n确定用这个码创建新的（空）数据吗？\n如果另一台设备已经用过别的码，请先核对再进入。')){
        btn.disabled=false; btn.textContent='进入'; return;
      }
      syncCode = code;
      try{ localStorage.setItem(CODE_KEY, code); }catch(e){}
      state = {students: hasData? doc.students : []};
      saveLocalCache();
      setSync('ok');
      showApp();
      if(!hasData) save();
    }).catch(function(){
      btn.disabled=false; btn.textContent='进入';
      alert('无法连接服务器，请检查网络后重试。');
    });
  }
  function logout(){
    if(!confirm('退出后本机将清除同步码，需要重新输入才能进入。确定退出？')) return;
    try{ localStorage.removeItem(CODE_KEY); }catch(e){}
    location.reload();
  }
  function copyCode(){
    if(!syncCode) return;
    var ta = document.createElement('textarea');
    ta.value = syncCode; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(ta);
    toast('同步码已复制', false);
  }

  /* ---------- 事件绑定 ---------- */
  el('codeBtn').addEventListener('click', enterCode);
  el('genCodeBtn').addEventListener('click', function(){ el('codeInput').value = genCode(); });
  el('codeInput').addEventListener('keydown', function(e){ if(e.key==='Enter') enterCode(); });

  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('.tab').forEach(function(x){ x.classList.toggle('active', x===t); });
      var v=t.getAttribute('data-view');
      el('view-ledger').classList.toggle('hidden', v!=='ledger');
      el('view-income').classList.toggle('hidden', v!=='income');
    });
  });

  el('searchInput').addEventListener('input', renderList);
  el('sortSelect').addEventListener('change', renderList);
  el('addStudentBtn').addEventListener('click', function(){ openForm(null); });

  el('studentList').addEventListener('click', function(e){
    var row=e.target.closest('.student-row'); if(!row) return;
    var id=row.getAttribute('data-id');
    var btn=e.target.closest('[data-act]');
    var act=btn? btn.getAttribute('data-act') : null;
    if(act==='lesson') openOp(id,'lesson');
    else if(act==='leave') openOp(id,'leave');
    else if(act==='purchase') openOp(id,'purchase');
    else openDrawer(id);
  });

  el('opBody').addEventListener('click', function(e){
    var seg=e.target.closest('.seg-btn');
    if(seg){
      opState.qty=parseInt(seg.getAttribute('data-qty'),10);
      el('opBody').querySelectorAll('.seg-btn').forEach(function(b){ b.classList.toggle('active', b===seg); });
      refreshPreview();
    }
    var chip=e.target.closest('.chip');
    if(chip){
      opState.qty=parseInt(chip.getAttribute('data-qty'),10);
      el('opBody').querySelectorAll('.chip').forEach(function(c){ c.classList.toggle('active', c===chip); });
      var inp=el('opQty'); if(inp) inp.value=opState.qty;
      refreshPreview();
    }
  });
  el('opBody').addEventListener('input', function(e){
    if(e.target.id==='opQty'){
      opState.qty=parseInt(e.target.value,10)||0;
      el('opBody').querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
      refreshPreview();
    }
  });
  el('opCancel').addEventListener('click', closeModal);
  el('opClose').addEventListener('click', closeModal);
  el('opConfirm').addEventListener('click', function(){ if(opMode==='form') submitForm(); else submitOp(); });
  el('modal').addEventListener('click', function(e){ if(e.target===el('modal')) closeModal(); });

  el('drawerClose').addEventListener('click', closeDrawer);
  el('drawer').addEventListener('click', function(e){ if(e.target===el('drawer')) closeDrawer(); });
  el('drLesson').addEventListener('click', function(){ openOp(currentStudentId,'lesson'); });
  el('drLeave').addEventListener('click', function(){ openOp(currentStudentId,'leave'); });
  el('drPurchase').addEventListener('click', function(){ openOp(currentStudentId,'purchase'); });
  el('drEdit').addEventListener('click', function(){ var id=currentStudentId; closeDrawer(); openForm(id); });
  el('drDelete').addEventListener('click', function(){
    var s=student(currentStudentId);
    if(!confirm('确定删除学生「'+s.name+'」？删除后无法恢复。')) return;
    state.students=state.students.filter(function(x){ return x.id!==currentStudentId; });
    closeDrawer(); save(); renderAll(); toast('已删除 '+s.name, false);
  });

  el('prevMonth').addEventListener('click', function(){ shiftMonth(-1); });
  el('nextMonth').addEventListener('click', function(){ shiftMonth(1); });
  el('monthSelect').addEventListener('change', renderIncome);
  function shiftMonth(d){
    var sel=el('monthSelect'); var i=sel.selectedIndex;
    var ni=Math.min(sel.options.length-1, Math.max(0, i+d));
    sel.selectedIndex=ni; renderIncome();
  }

  el('userMenu').addEventListener('click', function(e){ e.stopPropagation(); el('userDropdown').classList.toggle('hidden'); });
  document.addEventListener('click', function(e){
    if(!e.target.closest('#userDropdown') && e.target!==el('userMenu')) el('userDropdown').classList.add('hidden');
  });
  el('showCodeBtn').addEventListener('click', function(){ el('userDropdown').classList.add('hidden'); copyCode(); });
  el('logoutBtn').addEventListener('click', logout);

  /* ---------- 启动 ---------- */
  if(syncCode){
    setSync('loading');
    loadFromCloud().then(function(ok){ setSync(ok?'ok':'error'); showApp(); });
  } else {
    showLogin();
  }
})();
