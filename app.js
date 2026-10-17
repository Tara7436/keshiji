(function(){
  'use strict';
  var STORE_KEY = 'lesson_demo_v1';
  var state = { loggedIn:false, students:[] };
  var lastRecord = null;
  var opState = { id:null, type:null, qty:1 };
  var opMode = 'op';       // 'op' | 'form'
  var editingId = null;
  var currentStudentId = null;
  var toastTimer = null;

  function el(id){ return document.getElementById(id); }
  function val(id){ var n=el(id); return n? n.value : ''; }
  function uid(){ return 'id'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmt(n){ return '¥' + Math.round(n).toLocaleString('zh-CN'); }
  function friendly(date){ var p=date.split('-'); return parseInt(p[1],10)+'月'+parseInt(p[2],10)+'日'; }
  function fmtMonth(m){ var p=m.split('-'); return p[0]+'年'+parseInt(p[1],10)+'月'; }

  /* ---------- 数据 ---------- */
  function st(id,name,price,purchases,lessons,leaves){
    var records=[];
    purchases.forEach(function(p){ records.push({id:uid(),date:p[0],type:'purchase',qty:p[1]}); });
    lessons.forEach(function(d){ records.push({id:uid(),date:d,type:'lesson',qty:1}); });
    (leaves||[]).forEach(function(d){ records.push({id:uid(),date:d,type:'leave',qty:1}); });
    return { id:id, name:name, price:price, note:'', records:records };
  }
  function seedStudents(){
    return [
      st('s1','王小明',120,[['2026-08-12',10]],['2026-09-10','2026-10-07'],['2026-09-25']),
      st('s2','李思思',150,[['2026-08-01',10]],['2026-08-15','2026-08-29','2026-09-05','2026-09-19','2026-09-26','2026-10-03','2026-10-10','2026-10-14'],['2026-09-30']),
      st('s3','张子涵',100,[['2026-07-20',10]],['2026-08-02','2026-08-16','2026-08-30','2026-09-13','2026-09-27','2026-10-04','2026-10-11','2026-10-13','2026-10-14']),
      st('s4','陈浩然',120,[['2026-07-05',10]],['2026-07-19','2026-08-02','2026-08-16','2026-08-30','2026-09-13','2026-09-27','2026-10-04','2026-10-11','2026-10-14','2026-10-16']),
      st('s5','刘雨桐',130,[['2026-09-01',20]],['2026-09-06','2026-09-20','2026-10-04','2026-10-11','2026-10-14']),
      st('s6','赵一诺',110,[['2026-09-10',10]],['2026-09-15','2026-09-29','2026-10-06','2026-10-13','2026-10-14']),
      st('s7','周子墨',140,[['2026-08-25',10]],['2026-09-01','2026-09-15','2026-09-29','2026-10-06','2026-10-13','2026-10-14','2026-10-15','2026-10-16']),
      st('s8','吴梓萱',120,[['2026-09-15',10]],['2026-09-22','2026-09-29','2026-10-06','2026-10-13','2026-10-14','2026-10-15','2026-10-16'])
    ];
  }
  function load(){
    try{
      var raw = localStorage.getItem(STORE_KEY);
      if(raw){
        var p = JSON.parse(raw);
        state = { loggedIn:!!p.loggedIn, students:(p.students && p.students.length)?p.students:seedStudents() };
        return;
      }
    }catch(e){}
    state = { loggedIn:false, students:seedStudents() };
  }
  function save(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify({loggedIn:state.loggedIn, students:state.students})); }catch(e){}
  }
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
  function lastRecordOf(s){
    var last=null;
    s.records.forEach(function(r){ if(!last || r.date>last.date) last=r; });
    return last;
  }
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

  /* ---------- 弹窗 / 抽屉开关 ---------- */
  function closeModal(){ el('modal').classList.add('hidden'); }

  /* ---------- Toast ---------- */
  function toast(msg,withUndo){
    var t=el('toast');
    t.innerHTML='<span>'+msg+'</span>'+(withUndo?'<button class="undo" id="undoBtn">撤销</button>':'');
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){ t.classList.add('hidden'); }, 5000);
    if(withUndo) el('undoBtn').addEventListener('click', function(){ undoLast(); t.classList.add('hidden'); });
  }

  /* ---------- 登录 ---------- */
  function showLogin(){ el('login').classList.remove('hidden'); el('app').classList.add('hidden'); }
  function showApp(){
    el('login').classList.add('hidden'); el('app').classList.remove('hidden');
    populateMonths(); renderAll();
  }

  /* ---------- 事件绑定 ---------- */
  el('loginBtn').addEventListener('click', function(){ state.loggedIn=true; save(); showApp(); });
  el('skipLogin').addEventListener('click', function(){ state.loggedIn=true; save(); showApp(); });
  el('phoneInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ state.loggedIn=true; save(); showApp(); } });

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
  el('resetData').addEventListener('click', function(){
    if(!confirm('确定重置为演示数据？你本机的修改会被覆盖。')) return;
    state.students=seedStudents(); save(); populateMonths(); renderAll();
    el('userDropdown').classList.add('hidden'); toast('已重置为演示数据', false);
  });
  el('logoutBtn').addEventListener('click', function(){
    state.loggedIn=false; save(); el('userDropdown').classList.add('hidden'); showLogin();
  });

  /* ---------- 启动 ---------- */
  load();
  if(state.loggedIn) showApp(); else showLogin();
})();
