const DB_NAME="personal-finance-local",STORE="vault",BACKUP_FORMAT="PFLOCAL_BACKUP",ITER=310000;
let db,cryptoKey=null,appData=null,messageTimer;
let txDisplayLimit=50;
let txFilter={kw:"",from:"",to:""};
const $=id=>document.getElementById(id), uid=()=>crypto.randomUUID(), today=()=>new Date().toISOString().slice(0,10);
const money=n=>new Intl.NumberFormat("vi-VN",{maximumFractionDigits:0}).format(n||0)+" ₫";
const fmt=n=>new Intl.NumberFormat("vi-VN",{maximumFractionDigits:0}).format(n||0);
const digits=s=>String(s||"").replace(/\D/g,"");

const DEFAULT_ACCOUNTS=[
  {name:"Tiền mặt",type:"Tiền mặt"},
  {name:"VCB",type:"VCB"},
  {name:"TCB",type:"TCB"},
  {name:"MBB",type:"MBB"},
  {name:"Ví khác",type:"Ví khác"},
  {name:"Vay nợ",type:"Vay nợ"}
];
const DEFAULT_CATS={
  INCOME:["Tiền lương","Tiền thưởng","Tiền lãi","Thu khác","Vay nợ","Thu nợ"],
  EXPENSE:[
    "Đi chợ siêu thị","Ăn uống","Hóa đơn","Tiền nhà","Đi lại","Giúp việc","Chi tiêu thiết yếu khác",
    "Vui chơi giải trí","Mua sắm","Làm đẹp","Thể thao","Đồ gia dụng","Mua sắm giải trí khác",
    "Giáo dục","Y tế","Bảo hiểm","Giáo dục Y tế Bảo hiểm khác",
    "Mở/Nộp tiền tiết kiệm",
    "Chứng khoán","Bất động sản","Quỹ","Con cái","Bố mẹ","Đầu tư khác",
    "Sự kiện","Biếu tặng","Dịch vụ công","Chi khác",
    "Cho vay","Trả nợ"
  ]
};

function openDb(){return new Promise((res,rej)=>{let r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function readVault(){return new Promise((res,rej)=>{let r=db.transaction(STORE).objectStore(STORE).get("main");r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}
function writeVault(v){return new Promise((res,rej)=>{let t=db.transaction(STORE,"readwrite");t.objectStore(STORE).put(v,"main");t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function b64(b){return btoa(String.fromCharCode(...new Uint8Array(b)))}
function un64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function derive(p,s){let m=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:s,iterations:ITER,hash:"SHA-256"},m,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function enc(d,k){let iv=crypto.getRandomValues(new Uint8Array(12)),c=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,new TextEncoder().encode(JSON.stringify(d)));return{iv:b64(iv),ciphertext:b64(new Uint8Array(c))}}
async function dec(v,k){return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:un64(v.iv)},k,un64(v.ciphertext))))}
async function persist(){let e=await enc(appData,cryptoKey);await writeVault({version:1,salt:window.localSalt,iv:e.iv,ciphertext:e.ciphertext,updatedAt:new Date().toISOString()})}
function msg(s){$("message").textContent=s;$("message").classList.remove("hidden");clearTimeout(messageTimer);messageTimer=setTimeout(()=>$("message").classList.add("hidden"),3500)}
function showOnly(id){["setupPanel","unlockPanel","appPanel"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}

function defaults(){
  return{
    schemaVersion:4,
    accounts:DEFAULT_ACCOUNTS.map(a=>({id:uid(),name:a.name,type:a.type,openingBalance:0,active:true})),
    transactions:[],
    categories:{INCOME:[...DEFAULT_CATS.INCOME],EXPENSE:[...DEFAULT_CATS.EXPENSE]},
    budgets:[],
    debts:[],
    createdAt:new Date().toISOString()
  };
}
function normalize(d){
  let x=defaults();
  let cats={
    INCOME:d.categories?.INCOME?.length?d.categories.INCOME:x.categories.INCOME,
    EXPENSE:d.categories?.EXPENSE?.length?d.categories.EXPENSE:x.categories.EXPENSE
  };
  // ensure key categories exist
  for(let c of ["Vay nợ","Thu nợ"]) if(!cats.INCOME.includes(c)) cats.INCOME.push(c);
  for(let c of ["Cho vay","Trả nợ"]) if(!cats.EXPENSE.includes(c)) cats.EXPENSE.push(c);
  return{
    ...x,...d,
    schemaVersion:4,
    accounts:d.accounts?.length?d.accounts:x.accounts,
    transactions:d.transactions||[],
    categories:cats,
    budgets:d.budgets||[],
    debts:d.debts||[]
  };
}

function isFutureDate(d){return d && d>today()}
function ensureNotFuture(dateStr){
  if(isFutureDate(dateStr)){msg("Nhập lại ngày tháng");return false}
  return true;
}

async function setup(p){
  let s=crypto.getRandomValues(new Uint8Array(16));
  window.localSalt=b64(s);
  cryptoKey=await derive(p,s);
  appData=defaults();
  await persist();
  showOnly("appPanel");
  $("lockBtn").classList.remove("hidden");
  render();
}
async function unlock(p){
  let v=await readVault();
  window.localSalt=v.salt;
  cryptoKey=await derive(p,un64(v.salt));
  appData=normalize(await dec(v,cryptoKey));
  await persist();
  showOnly("appPanel");
  $("lockBtn").classList.remove("hidden");
  render();
}
function lock(){
  cryptoKey=appData=null;
  $("lockBtn").classList.add("hidden");
  $("unlockPassword").value="";
  showOnly("unlockPanel");
  updateBioUI();
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function txTotal(type){
  return appData.transactions.filter(t=>t.type===type).reduce((s,t)=>s+t.amount,0);
}

function accountBalance(accId){
  let a=appData.accounts.find(x=>x.id===accId);
  if(!a) return 0;
  let bal=a.openingBalance||0;
  for(let t of appData.transactions){
    if(t.type==="TRANSFER"){
      if(t.accountId===accId) bal-=t.amount;
      if(t.toAccountId===accId) bal+=t.amount;
    }else if(t.accountId===accId){
      bal+= (t.type==="INCOME" ? t.amount : -t.amount);
    }
  }
  return bal;
}

function getDebtAccount(){
  return appData.accounts.find(a=>a.type==="Vay nợ"||a.name==="Vay nợ");
}

function render(){
  // coalesce multiple render calls into one frame (mượt hơn trên Android)
  if(window.__renderScheduled) return;
  window.__renderScheduled = true;
  requestAnimationFrame(()=>{ window.__renderScheduled=false; renderNow(); });
}
function renderNow(){
  let inc=txTotal("INCOME"), out=txTotal("EXPENSE");
  let opening=appData.accounts.reduce((s,a)=>s+(a.openingBalance||0),0);
  $("incomeTotal").textContent=money(inc);
  $("expenseTotal").textContent=money(out);
  $("netTotal").textContent=money(opening+inc-out);
  renderAccounts();
  renderTransactions();
  renderCategories();
  renderBudgetOptions();
  renderBudgets();
  renderDebts();
  fillAccountOptions();
  fillCategoryOptions();
  fillTransferOptions();
  fillDebtAccountOptions();
  initStatsDates();
}

function sortedTransactions(){
  return [...appData.transactions].sort((a,b)=>b.date.localeCompare(a.date)|| (b.createdAt||"").localeCompare(a.createdAt||""));
}

function filteredTransactions(){
  let rows=sortedTransactions();
  let {kw,from,to}=txFilter;
  kw=(kw||"").toLowerCase().trim();
  return rows.filter(t=>{
    if(from && t.date<from) return false;
    if(to && t.date>to) return false;
    if(kw){
      let a=appData.accounts.find(x=>x.id===t.accountId);
      let toA=t.toAccountId?appData.accounts.find(x=>x.id===t.toAccountId):null;
      let hay=[t.category,t.note,a?.name,toA?.name,t.type].join(" ").toLowerCase();
      if(!hay.includes(kw)) return false;
    }
    return true;
  });
}

function renderTransactions(){
  const list = $("transactionList");
  if(!list) return;
  const rows = filteredTransactions();
  const show = rows.slice(0, txDisplayLimit);
  if(!show.length){
    list.innerHTML = '<div class="empty">Chưa có giao dịch'+(txFilter.kw||txFilter.from||txFilter.to?' khớp tìm kiếm':'')+'.</div>';
  }else{
    const accMap = {};
    for(const a of appData.accounts) accMap[a.id] = a.name;
    let lastDay = "";
    let html = "";
    for(let i=0;i<show.length;i++){
      const t = show[i];
      if(t.date !== lastDay){
        lastDay = t.date;
        html += '<div class="day-sep">'+esc(t.date)+'</div>';
      }
      if(t.type === "TRANSFER"){
        html += '<div class="list-row"><div class="grow"><b>Chuyển khoản <span class="transfer-tag">Chuyển</span></b><small>'
          +esc(accMap[t.accountId]||"?")+' → '+esc(accMap[t.toAccountId]||"?")
          +(t.note?(' · '+esc(t.note)):'')+'</small></div><strong class="amount">'+money(t.amount)
          +'</strong><div class="actions"><button data-del-tx="'+t.id+'" class="tiny danger">Xóa</button></div></div>';
      }else{
        const tag = t.debtId ? (' <span class="debt-tag '+(t.type==="INCOME"?"lend":"borrow")+'">Vay nợ</span>') : "";
        html += '<div class="list-row"><div class="grow"><b>'+esc(t.category)+tag+'</b><small>'
          +esc(accMap[t.accountId]||"Tài khoản đã xóa")+(t.note?(' · '+esc(t.note)):'')
          +'</small></div><strong class="amount '+(t.type==="INCOME"?"income":"expense")+'">'
          +(t.type==="INCOME"?"+":"−")+money(t.amount)
          +'</strong><div class="actions"><button data-edit-tx="'+t.id+'" class="tiny">Sửa</button>'
          +'<button data-del-tx="'+t.id+'" class="tiny danger">Xóa</button></div></div>';
      }
    }
    list.innerHTML = html;
  }
  const remain = rows.length - show.length;
  const wrap = $("loadMoreWrap");
  if(wrap){
    if(remain > 0){
      wrap.classList.remove("hidden");
      $("loadMoreBtn").textContent = "Hiển thị thêm (còn "+remain+")";
    }else wrap.classList.add("hidden");
  }
}

function renderAccounts(){
  let q=($("accountSearch")?.value||"").toLowerCase();
  let arr=appData.accounts.filter(a=>a.name.toLowerCase().includes(q)||a.type.toLowerCase().includes(q));
  $("accountList").innerHTML=arr.map(a=>{
    let bal=accountBalance(a.id);
    let neg=bal<0;
    return `<div class="list-row">
      <div class="grow"><b>${esc(a.name)}</b><small>${esc(a.type)}</small></div>
      <strong class="${neg?"neg-bal":""}">${money(bal)}</strong>
      <div class="actions">
        <button class="tiny" data-edit-account="${a.id}">Sửa</button>
        <button class="tiny danger" data-del-account="${a.id}">Xóa</button>
      </div>
    </div>`;
  }).join("")||'<div class="empty">Không tìm thấy tài khoản.</div>';
}

function renderCategories(){
  let groups={
    "Thu nhập":appData.categories.INCOME,
    "Chi tiêu thiết yếu":["Đi chợ siêu thị","Ăn uống","Hóa đơn","Tiền nhà","Đi lại","Giúp việc","Chi tiêu thiết yếu khác"],
    "Mua sắm giải trí":["Vui chơi giải trí","Mua sắm","Làm đẹp","Thể thao","Đồ gia dụng","Mua sắm giải trí khác"],
    "Giáo dục, Y tế, Bảo hiểm":["Giáo dục","Y tế","Bảo hiểm","Giáo dục Y tế Bảo hiểm khác"],
    "Tiết kiệm":["Mở/Nộp tiền tiết kiệm"],
    "Đầu tư":["Chứng khoán","Bất động sản","Quỹ","Con cái","Bố mẹ","Đầu tư khác"],
    "Chi khác":["Sự kiện","Biếu tặng","Dịch vụ công","Chi khác","Cho vay","Trả nợ"]
  };
  let out=[];
  out.push(`<div class="cat-group">Thu nhập</div>`);
  for(let name of appData.categories.INCOME){
    out.push(`<div class="list-row cat-child"><div class="grow"><b>${esc(name)}</b></div>
      <button class="tiny danger" data-del-category="INCOME|${encodeURIComponent(name)}">Xóa</button></div>`);
  }
  let used=new Set();
  for(let [gname,list] of Object.entries(groups)){
    if(gname==="Thu nhập") continue;
    let items=list.filter(n=>appData.categories.EXPENSE.includes(n));
    if(!items.length) continue;
    out.push(`<div class="cat-group">${esc(gname)}</div>`);
    for(let name of items){
      used.add(name);
      out.push(`<div class="list-row cat-child"><div class="grow"><b>${esc(name)}</b></div>
        <button class="tiny danger" data-del-category="EXPENSE|${encodeURIComponent(name)}">Xóa</button></div>`);
    }
  }
  let rest=appData.categories.EXPENSE.filter(n=>!used.has(n));
  if(rest.length){
    out.push(`<div class="cat-group">Khác</div>`);
    for(let name of rest){
      out.push(`<div class="list-row cat-child"><div class="grow"><b>${esc(name)}</b></div>
        <button class="tiny danger" data-del-category="EXPENSE|${encodeURIComponent(name)}">Xóa</button></div>`);
    }
  }
  $("categoryList").innerHTML=out.join("")||'<div class="empty">Chưa có danh mục.</div>';
}

function fillAccountOptions(){
  let s=$("txAccount"),old=s?.value;
  if(!s) return;
  s.innerHTML=appData.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
  if(old && [...s.options].some(o=>o.value===old)) s.value=old;
}
function fillCategoryOptions(){
  let type=$("txType")?.value||"EXPENSE",s=$("txCategory"),old=s?.value;
  if(!s) return;
  s.innerHTML=(appData.categories[type]||[]).map(c=>`<option>${esc(c)}</option>`).join("");
  if(old && [...s.options].some(o=>o.value===old)) s.value=old;
}
function fillTransferOptions(){
  let opts=appData.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
  let f=$("tfFrom"),t=$("tfTo");
  if(!f||!t) return;
  let of=f.value,ot=t.value;
  f.innerHTML=opts; t.innerHTML=opts;
  if(of && [...f.options].some(o=>o.value===of)) f.value=of;
  if(ot && [...t.options].some(o=>o.value===ot)) t.value=ot;
}
function fillDebtAccountOptions(){
  // only non-debt wallets for related account
  let wallets=appData.accounts.filter(a=>a.type!=="Vay nợ"&&a.name!=="Vay nợ");
  let opts=wallets.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
  let d=$("debtAccount"),r=$("repayAccount");
  if(d){let od=d.value;d.innerHTML=opts;if(od&&[...d.options].some(o=>o.value===od))d.value=od}
  if(r){let or=r.value;r.innerHTML=opts;if(or&&[...r.options].some(o=>o.value===or))r.value=or}
}

function renderBudgetOptions(){
  let s=$("budgetCategory"),old=s?.value;
  if(!s) return;
  s.innerHTML=appData.categories.EXPENSE.map(c=>`<option>${esc(c)}</option>`).join("");
  if(old && [...s.options].some(o=>o.value===old)) s.value=old;
}
function monthNow(){return today().slice(0,7)}
function renderBudgets(){
  let m=monthNow();
  $("budgetList").innerHTML=appData.budgets.map(b=>{
    let spent=appData.transactions.filter(t=>t.type==="EXPENSE"&&t.category===b.category&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0);
    let pct=b.amount?spent/b.amount*100:0;
    let warning=pct>=100?"Đã vượt hạn mức":pct>=80?"Sắp chạm hạn mức":"Trong hạn mức";
    return `<div class="budget-item">
      <div class="row-between"><b>${esc(b.category)}</b>
        <button class="tiny danger" data-del-budget="${encodeURIComponent(b.category)}">Xóa</button></div>
      <div>${money(spent)} / ${money(b.amount)}</div>
      <div class="progress"><i style="width:${Math.min(100,pct)}%"></i></div>
      <small class="${pct>=80?"warning":""}">${warning} · ${Math.round(pct)}%</small>
    </div>`;
  }).join("")||'<div class="empty">Chưa đặt hạn mức nào.</div>';
}

function debtRemaining(d){
  let paid=appData.transactions
    .filter(t=>t.debtId===d.id && (t.category==="Thu nợ"||t.category==="Trả nợ"))
    .reduce((s,t)=>s+t.amount,0);
  return Math.max(0, (d.amount||0) - paid);
}

function renderDebts(){
  let openLend=0, openBorrow=0;
  let list=appData.debts.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  let html=list.map(d=>{
    let rem=debtRemaining(d);
    if(rem>0){
      if(d.type==="CHO_VAY") openLend+=rem;
      else openBorrow+=rem;
    }
    let typeLabel=d.type==="CHO_VAY"?"Cho vay":"Vay nợ";
    let tagClass=d.type==="CHO_VAY"?"lend":"borrow";
    let status=rem<=0?'<span style="color:#166534;font-weight:700">Đã tất toán</span>':`<span class="warning">Còn ${money(rem)}</span>`;
    return `<div class="list-row" style="flex-wrap:wrap">
      <div class="grow">
        <b>${esc(d.person)} <span class="debt-tag ${tagClass}">${typeLabel}</span></b>
        <small>${esc(d.date)} · Gốc ${money(d.amount)}${d.note?" · "+esc(d.note):""}</small>
      </div>
      <div style="text-align:right">
        <div>${status}</div>
        <div class="actions" style="margin-top:6px;justify-content:flex-end">
          ${rem>0?`<button class="tiny" data-repay="${d.id}">${d.type==="CHO_VAY"?"Thu nợ":"Trả nợ"}</button>`:""}
          <button class="tiny danger" data-del-debt="${d.id}">Xóa</button>
        </div>
      </div>
    </div>`;
  }).join("")||'<div class="empty">Chưa có khoản vay / cho vay nào.</div>';
  $("debtList").innerHTML=html;
  $("lendTotal").textContent=money(openLend);
  $("borrowTotal").textContent=money(openBorrow);
}

function switchTab(t){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));
  ["accounts","transactions","debts","stats","budgets","categories","backup"].forEach(v=>{
    let el=$(`${v}View`);
    if(el) el.classList.toggle("hidden",v!==t);
  });
}

function showTxForm(t){
  $("transferForm").classList.add("hidden");
  $("transactionForm").classList.remove("hidden");
  $("txFormTitle").textContent=t?"Sửa giao dịch":"Thêm giao dịch";
  $("txId").value=t?.id||"";
  $("txType").value=t?.type||"EXPENSE";
  fillCategoryOptions();
  $("txAmount").value=t?fmt(t.amount):"";
  $("txDate").value=t?.date||today();
  fillAccountOptions();
  $("txAccount").value=t?.accountId||appData.accounts[0]?.id||"";
  $("txCategory").value=t?.category||$("txCategory").value;
  $("txNote").value=t?.note||"";
  $("transactionForm").scrollIntoView({behavior:"smooth",block:"start"});
}

function showTransferForm(){
  $("transactionForm").classList.add("hidden");
  $("transferForm").classList.remove("hidden");
  fillTransferOptions();
  $("tfDate").value=today();
  $("tfAmount").value="";
  $("tfNote").value="";
  $("transferForm").scrollIntoView({behavior:"smooth",block:"start"});
}

function moneyInput(el){
  let n=digits(el.value);
  el.value=n?fmt(Number(n)):"";
}

function download(blob,name){
  let u=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=u;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}

function exportCsv(){
  let rows=sortedTransactions();
  let header=["Ngày","Loại","Danh mục","Số tiền","Tài khoản","Tài khoản nhận","Ghi chú","ID"];
  let lines=[header.join(",")];
  for(let t of rows){
    let typeLabel=t.type==="INCOME"?"Thu nhập":t.type==="EXPENSE"?"Chi tiêu":"Chuyển khoản";
    let acc=appData.accounts.find(x=>x.id===t.accountId)?.name||"";
    let toAcc=t.toAccountId?(appData.accounts.find(x=>x.id===t.toAccountId)?.name||""):"";
    let cells=[t.date,typeLabel,t.category||(t.type==="TRANSFER"?"Chuyển khoản":""),t.amount,`"${(acc||"").replace(/"/g,'""')}"`,`"${(toAcc||"").replace(/"/g,'""')}"`,`"${(t.note||"").replace(/"/g,'""')}"`,t.id];
    lines.push(cells.join(","));
  }
  let bom="\uFEFF";
  download(new Blob([bom+lines.join("\n")],{type:"text/csv;charset=utf-8"}),`GiaoDich_${today()}.csv`);
  msg("Đã xuất file CSV. Mở bằng Excel hoặc Google Sheets.");
}

function copyTransactionsTable(){
  let rows=sortedTransactions();
  if(!rows.length){msg("Chưa có giao dịch để sao chép.");return}
  let header=["Ngày","Loại","Danh mục","Số tiền","Tài khoản","Ghi chú"];
  let tsv=[header.join("\t")];
  for(let t of rows){
    let typeLabel=t.type==="INCOME"?"Thu nhập":t.type==="EXPENSE"?"Chi tiêu":"Chuyển khoản";
    let acc=appData.accounts.find(x=>x.id===t.accountId)?.name||"";
    if(t.type==="TRANSFER"){
      let to=appData.accounts.find(x=>x.id===t.toAccountId)?.name||"";
      acc=`${acc} → ${to}`;
    }
    tsv.push([t.date,typeLabel,t.category||"",t.amount,acc,t.note||""].join("\t"));
  }
  navigator.clipboard.writeText(tsv.join("\n")).then(()=>msg("Đã sao chép bảng giao dịch. Dán vào Excel (Ctrl+V)."))
    .catch(()=>msg("Không sao chép được. Hãy dùng nút Xuất CSV."));
}

async function exportBackup(){
  let v=await readVault();
  download(new Blob([JSON.stringify({format:BACKUP_FORMAT,formatVersion:1,createdAt:new Date().toISOString(),vault:v})],{type:"application/json"}),`TaiChinhCaNhan_${today()}.pfbackup`);
  msg("Đã tạo file sao lưu mã hóa.");
}
async function importBackup(file){
  if(!file) throw Error("Hãy chọn file sao lưu.");
  let p=JSON.parse(await file.text());
  if(p.format!==BACKUP_FORMAT||!p.vault?.ciphertext) throw Error("File sao lưu không hợp lệ.");
  let pin=prompt("Nhập PIN/mật khẩu của file sao lưu:");
  if(!pin) return;
  let k=await derive(pin,un64(p.vault.salt));
  let d=normalize(await dec(p.vault,k));
  if(!confirm("Khôi phục sẽ thay thế dữ liệu hiện tại. Tiếp tục?")) return;
  await writeVault(p.vault);
  cryptoKey=k;
  window.localSalt=p.vault.salt;
  appData=d;
  txDisplayLimit=50;
  render();
  msg("Đã khôi phục dữ liệu.");
}

/* STATS */
function initStatsDates(){
  let now=new Date();
  let y=now.getFullYear(), m=String(now.getMonth()+1).padStart(2,"0");
  let last=new Date(y,now.getMonth()+1,0).getDate();
  if($("statsFrom") && !$("statsFrom").value) $("statsFrom").value=`${y}-${m}-01`;
  if($("statsTo") && !$("statsTo").value) $("statsTo").value=`${y}-${m}-${String(last).padStart(2,"0")}`;
  if($("statsYear") && !$("statsYear").value) $("statsYear").value=y;
}
function runStats(){
  let mode=$("statsMode").value;
  let from,to;
  if(mode==="year"){
    let y=$("statsYear").value||new Date().getFullYear();
    from=`${y}-01-01`; to=`${y}-12-31`;
  }else{
    from=$("statsFrom").value; to=$("statsTo").value;
  }
  if(!from||!to){msg("Chọn khoảng ngày hợp lệ.");return}
  let txs=appData.transactions.filter(t=>t.date>=from && t.date<=to && (t.type==="INCOME"||t.type==="EXPENSE"));
  let exp={},inc={};
  for(let t of txs){
    if(t.type==="EXPENSE") exp[t.category]=(exp[t.category]||0)+t.amount;
    else inc[t.category]=(inc[t.category]||0)+t.amount;
  }
  function bars(map,cls){
    let entries=Object.entries(map).sort((a,b)=>b[1]-a[1]);
    if(!entries.length) return '<div class="empty">Không có dữ liệu.</div>';
    let max=entries[0][1]||1;
    return entries.map(([k,v])=>`<div class="chart-bar">
      <div class="label" title="${esc(k)}">${esc(k)}</div>
      <div class="bar ${cls}"><i style="width:${Math.max(2,v/max*100)}%"></i></div>
      <div class="val">${money(v)}</div>
    </div>`).join("");
  }
  $("statsExpenseChart").innerHTML=bars(exp,"exp");
  $("statsIncomeChart").innerHTML=bars(inc,"inc");
}

/* EVENTS */
$("setupForm").onsubmit=async e=>{
  e.preventDefault();
  let p=$("setupPassword").value,p2=$("setupPassword2").value;
  if(!/^\d{4,}$/.test(p)) return msg("PIN phải gồm ít nhất 4 chữ số.");
  if(p!==p2) return msg("Hai PIN không khớp.");
  try{await setup(p);msg("Đã tạo kho dữ liệu.")}catch(x){msg(x.message)}
};
$("unlockForm").onsubmit=async e=>{
  e.preventDefault();
  try{await unlock($("unlockPassword").value);msg("Đã mở khóa.")}
  catch(x){$("unlockError").textContent="Không mở được dữ liệu. Kiểm tra lại PIN/mật khẩu."}
};
document.querySelectorAll(".peek").forEach(b=>b.onclick=()=>{
  let x=$(b.dataset.target);
  x.type=x.type==="password"?"text":"password";
  b.textContent=x.type==="password"?"Hiện":"Ẩn";
});
document.querySelectorAll(".clear").forEach(b=>b.onclick=()=>{
  $(b.dataset.target).value="";
  $(b.dataset.target).focus();
});
$("lockBtn").onclick=lock;
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

/* Search */
$("txSearchBtn").onclick=()=>{
  txFilter={kw:$("txSearchKw").value,from:$("txSearchFrom").value,to:$("txSearchTo").value};
  txDisplayLimit=50;
  renderTransactions();
};
$("txSearchKw").onkeydown=e=>{if(e.key==="Enter"){$("txSearchBtn").click()}};

/* Transactions */
$("addTransactionBtn").onclick=()=>showTxForm();
$("cancelTransactionBtn").onclick=()=>$("transactionForm").classList.add("hidden");
$("txType").onchange=fillCategoryOptions;
$("txAmount").oninput=()=>moneyInput($("txAmount"));
$("transactionForm").onsubmit=async e=>{
  e.preventDefault();
  let id=$("txId").value;
  let amount=Number(digits($("txAmount").value));
  let date=$("txDate").value;
  if(!ensureNotFuture(date)) return;
  if(!Number.isSafeInteger(amount)||amount<=0) return msg("Số tiền phải lớn hơn 0.");
  let item={
    id:id||uid(),
    type:$("txType").value,
    amount,
    date,
    accountId:$("txAccount").value,
    category:$("txCategory").value,
    note:$("txNote").value.trim(),
    createdAt:new Date().toISOString()
  };
  if(id) appData.transactions=appData.transactions.map(t=>t.id===id?{...t,...item}:t);
  else appData.transactions.push(item);
  await persist();
  render();
  $("transactionForm").classList.add("hidden");
  msg(id?"Đã cập nhật giao dịch.":"Đã lưu giao dịch.");
};
$("transactionList").onclick=async e=>{
  let ed=e.target.dataset.editTx, del=e.target.dataset.delTx;
  if(ed){
    let t=appData.transactions.find(x=>x.id===ed);
    if(t && t.type!=="TRANSFER") showTxForm(t);
    return;
  }
  if(del && confirm("Xóa giao dịch này?")){
    appData.transactions=appData.transactions.filter(t=>t.id!==del);
    await persist();
    render();
    msg("Đã xóa giao dịch.");
  }
};
$("loadMoreBtn").onclick=()=>{
  txDisplayLimit+=50;
  renderTransactions();
};

/* Transfer */
$("addTransferBtn").onclick=showTransferForm;
$("cancelTransferBtn").onclick=()=>$("transferForm").classList.add("hidden");
$("tfAmount").oninput=()=>moneyInput($("tfAmount"));
$("transferForm").onsubmit=async e=>{
  e.preventDefault();
  let from=$("tfFrom").value, to=$("tfTo").value;
  let amount=Number(digits($("tfAmount").value));
  let date=$("tfDate").value;
  if(!ensureNotFuture(date)) return;
  if(from===to) return msg("Hai tài khoản phải khác nhau.");
  if(!Number.isSafeInteger(amount)||amount<=0) return msg("Số tiền phải lớn hơn 0.");
  let item={
    id:uid(),
    type:"TRANSFER",
    amount,
    date,
    accountId:from,
    toAccountId:to,
    category:"Chuyển khoản",
    note:$("tfNote").value.trim(),
    createdAt:new Date().toISOString()
  };
  appData.transactions.push(item);
  await persist();
  render();
  $("transferForm").classList.add("hidden");
  msg("Đã chuyển khoản thành công.");
};

/* Accounts */
$("addAccountBtn").onclick=()=>{
  $("accountForm").reset();
  $("accountId").value="";
  $("accountFormTitle").textContent="Thêm tài khoản";
  $("accountForm").classList.remove("hidden");
};
$("cancelAccountBtn").onclick=()=>$("accountForm").classList.add("hidden");
let _accSearchTimer; $("accountSearch").oninput=()=>{clearTimeout(_accSearchTimer);_accSearchTimer=setTimeout(renderAccounts,120)};
$("accountForm").onsubmit=async e=>{
  e.preventDefault();
  let id=$("accountId").value, name=$("accountName").value.trim();
  if(id){
    let a=appData.accounts.find(a=>a.id===id);
    a.name=name; a.type=$("accountType").value;
  }else{
    appData.accounts.push({id:uid(),name,type:$("accountType").value,openingBalance:0,active:true});
  }
  await persist();
  render();
  $("accountForm").classList.add("hidden");
  msg("Đã lưu tài khoản.");
};
$("accountList").onclick=async e=>{
  let ed=e.target.dataset.editAccount, del=e.target.dataset.delAccount;
  if(ed){
    let a=appData.accounts.find(a=>a.id===ed);
    $("accountId").value=a.id;
    $("accountName").value=a.name;
    $("accountType").value=a.type;
    $("accountFormTitle").textContent="Sửa tài khoản";
    $("accountForm").classList.remove("hidden");
    return;
  }
  if(del){
    if(appData.transactions.some(t=>t.accountId===del||t.toAccountId===del))
      return alert("Tài khoản đang có giao dịch. Hãy sửa/xóa các giao dịch liên quan trước.");
    if(confirm("Xóa tài khoản này?")){
      appData.accounts=appData.accounts.filter(a=>a.id!==del);
      await persist();
      render();
    }
  }
};

/* Categories */
$("addCategoryBtn").onclick=()=>$("categoryForm").classList.remove("hidden");
$("cancelCategoryBtn").onclick=()=>$("categoryForm").classList.add("hidden");
$("categoryForm").onsubmit=async e=>{
  e.preventDefault();
  let n=$("categoryName").value.trim(), t=$("categoryType").value;
  if(!n) return;
  if(appData.categories[t].some(x=>x.toLowerCase()===n.toLowerCase())) return msg("Danh mục đã tồn tại.");
  appData.categories[t].push(n);
  await persist();
  render();
  $("categoryForm").reset();
  $("categoryForm").classList.add("hidden");
  msg("Đã thêm danh mục.");
};
$("categoryList").onclick=async e=>{
  let v=e.target.dataset.delCategory;
  if(!v) return;
  let [t,encoded]=v.split("|"), n=decodeURIComponent(encoded);
  if(appData.transactions.some(x=>x.type===t&&x.category===n))
    return alert("Danh mục đã được dùng trong giao dịch, không thể xóa.");
  if(confirm(`Xóa danh mục "${n}"?`)){
    appData.categories[t]=appData.categories[t].filter(x=>x!==n);
    await persist();
    render();
  }
};

/* Budgets */
$("budgetAmount").oninput=()=>moneyInput($("budgetAmount"));
$("budgetForm").onsubmit=async e=>{
  e.preventDefault();
  let c=$("budgetCategory").value, a=Number(digits($("budgetAmount").value));
  if(!c||!a) return msg("Nhập hạn mức hợp lệ.");
  let old=appData.budgets.find(x=>x.category===c);
  if(old) old.amount=a;
  else appData.budgets.push({category:c,amount:a});
  await persist();
  render();
  $("budgetAmount").value="";
  msg("Đã lưu hạn mức.");
};
$("budgetList").onclick=async e=>{
  let c=e.target.dataset.delBudget;
  if(!c) return;
  c=decodeURIComponent(c);
  appData.budgets=appData.budgets.filter(x=>x.category!==c);
  await persist();
  render();
};

/* Debts – logic with Vay nợ account */
$("addDebtBtn").onclick=()=>{
  $("repayForm").classList.add("hidden");
  $("debtForm").reset();
  $("debtId").value="";
  $("debtFormTitle").textContent="Thêm khoản vay / cho vay";
  $("debtDate").value=today();
  fillDebtAccountOptions();
  $("debtForm").classList.remove("hidden");
  $("debtForm").scrollIntoView({behavior:"smooth",block:"start"});
};
$("cancelDebtBtn").onclick=()=>$("debtForm").classList.add("hidden");
$("debtAmount").oninput=()=>moneyInput($("debtAmount"));
$("debtForm").onsubmit=async e=>{
  e.preventDefault();
  let type=$("debtType").value;
  let person=$("debtPerson").value.trim();
  let amount=Number(digits($("debtAmount").value));
  let walletId=$("debtAccount").value;
  let date=$("debtDate").value;
  let note=$("debtNote").value.trim();
  if(!ensureNotFuture(date)) return;
  if(!person||!amount||amount<=0) return msg("Nhập đầy đủ thông tin hợp lệ.");
  let debtAcc=getDebtAccount();
  if(!debtAcc){
    // auto create
    debtAcc={id:uid(),name:"Vay nợ",type:"Vay nợ",openingBalance:0,active:true};
    appData.accounts.push(debtAcc);
  }
  let debtId=uid();
  appData.debts.push({
    id:debtId,
    type,
    person,
    amount,
    date,
    note,
    createdAt:new Date().toISOString()
  });

  if(type==="VAY"){
    // Vay nợ: money from debt account -> wallet (TRANSFER), then mark as income? 
    // User: Tiền đi vay phải được chuyển từ tài khoản Vay nợ (trừ tiền) đến một tài khoản ví (cộng tiền)
    // So create TRANSFER from Vay nợ account to wallet
    appData.transactions.push({
      id:uid(),
      type:"TRANSFER",
      amount,
      date,
      accountId:debtAcc.id,
      toAccountId:walletId,
      category:"Chuyển khoản",
      note: note || `Vay từ ${person}`,
      debtId,
      createdAt:new Date().toISOString()
    });
    // also record as INCOME category Vay nợ on the wallet for tracking? Optional. Keep simple: transfer only + debt record.
  }else{
    // CHO_VAY: money leaves wallet to outside. Like expense, and optionally transfer concept.
    // For consistency: EXPENSE from wallet "Cho vay"
    appData.transactions.push({
      id:uid(),
      type:"EXPENSE",
      amount,
      date,
      accountId:walletId,
      category:"Cho vay",
      note: note || `Cho ${person} vay`,
      debtId,
      createdAt:new Date().toISOString()
    });
  }
  await persist();
  render();
  $("debtForm").classList.add("hidden");
  msg("Đã thêm khoản " + (type==="CHO_VAY"?"cho vay":"vay nợ") + ".");
};

$("debtList").onclick=async e=>{
  let repayId=e.target.dataset.repay;
  let delId=e.target.dataset.delDebt;
  if(repayId){
    let d=appData.debts.find(x=>x.id===repayId);
    if(!d) return;
    let rem=debtRemaining(d);
    $("debtForm").classList.add("hidden");
    $("repayDebtId").value=d.id;
    $("repayInfo").textContent=`${d.type==="CHO_VAY"?"Thu nợ từ":"Trả nợ cho"} ${d.person} · Còn lại ${money(rem)}`;
    $("repayAmount").value=fmt(rem);
    $("repayDate").value=today();
    $("repayNote").value="";
    fillDebtAccountOptions();
    $("repayForm").classList.remove("hidden");
    $("repayForm").scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  if(delId){
    if(!confirm("Xóa khoản này? Các giao dịch liên quan vẫn giữ nguyên.")) return;
    appData.debts=appData.debts.filter(x=>x.id!==delId);
    await persist();
    render();
    msg("Đã xóa khoản vay/nợ.");
  }
};

$("cancelRepayBtn").onclick=()=>$("repayForm").classList.add("hidden");
$("repayAmount").oninput=()=>moneyInput($("repayAmount"));
$("repayForm").onsubmit=async e=>{
  e.preventDefault();
  let debtId=$("repayDebtId").value;
  let d=appData.debts.find(x=>x.id===debtId);
  if(!d) return msg("Không tìm thấy khoản.");
  let amount=Number(digits($("repayAmount").value));
  let rem=debtRemaining(d);
  let date=$("repayDate").value;
  if(!ensureNotFuture(date)) return;
  if(!amount||amount<=0) return msg("Số tiền không hợp lệ.");
  if(amount>rem) return msg(`Số tiền vượt quá số còn lại (${money(rem)}).`);
  let walletId=$("repayAccount").value;
  let note=$("repayNote").value.trim();
  let debtAcc=getDebtAccount();
  if(!debtAcc){
    debtAcc={id:uid(),name:"Vay nợ",type:"Vay nợ",openingBalance:0,active:true};
    appData.accounts.push(debtAcc);
  }

  if(d.type==="VAY"){
    // Trả nợ: chuyển từ ví (trừ) đến tài khoản Vay nợ (cộng)
    appData.transactions.push({
      id:uid(),
      type:"TRANSFER",
      amount,
      date,
      accountId:walletId,
      toAccountId:debtAcc.id,
      category:"Chuyển khoản",
      note: note || `Trả nợ ${d.person}`,
      debtId,
      createdAt:new Date().toISOString()
    });
    // also log as EXPENSE Trả nợ for category tracking
    appData.transactions.push({
      id:uid(),
      type:"EXPENSE",
      amount,
      date,
      accountId:walletId,
      category:"Trả nợ",
      note: note || `Trả nợ ${d.person}`,
      debtId,
      createdAt:new Date().toISOString()
    });
  }else{
    // Thu nợ (CHO_VAY): money comes into wallet = INCOME Thu nợ
    appData.transactions.push({
      id:uid(),
      type:"INCOME",
      amount,
      date,
      accountId:walletId,
      category:"Thu nợ",
      note: note || `Thu nợ từ ${d.person}`,
      debtId,
      createdAt:new Date().toISOString()
    });
  }
  await persist();
  render();
  $("repayForm").classList.add("hidden");
  msg("Đã ghi nhận " + (d.type==="CHO_VAY"?"thu nợ":"trả nợ") + ".");
};

/* Stats */
$("statsMode").onchange=()=>{
  let y=$("statsMode").value==="year";
  $("statsYearWrap").classList.toggle("hidden",!y);
};
$("statsRunBtn").onclick=runStats;

/* Backup */
$("exportBackupBtn").onclick=()=>exportBackup().catch(e=>msg(e.message));

$("importBackupBtn").onclick=()=>importBackup($("backupFile").files[0]).catch(e=>msg("Khôi phục thất bại: "+e.message));
$("exportCsvBtn").onclick=()=>exportCsv();
$("copyTxBtn").onclick=()=>copyTransactionsTable();




/* ========== GOOGLE DRIVE BACKUP ========== */
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
let googleTokenClient = null;
let googleAccessToken = null;

function getSavedClientId(){
  return localStorage.getItem("pf_google_client_id") || "";
}
function setGoogleStatus(text, ok){
  let el = $("googleStatus");
  if(!el) return;
  el.textContent = text;
  el.style.color = ok ? "#075e58" : "#b45309";
}
function updateGoogleUI(){
  const logged = !!googleAccessToken;
  if($("googleLoginBtn")) $("googleLoginBtn").classList.toggle("hidden", logged);
  if($("googleLogoutBtn")) $("googleLogoutBtn").classList.toggle("hidden", !logged);
  if($("driveBackupBtn")) $("driveBackupBtn").disabled = !logged;
  if($("driveRestoreBtn")) $("driveRestoreBtn").disabled = !logged;
  if(logged) setGoogleStatus("Đã đăng nhập Google — có thể sao lưu", true);
  else setGoogleStatus(getSavedClientId() ? "Đã có Client ID — hãy Đăng nhập Google" : "Chưa cấu hình Client ID", false);
}

function initGoogleApis(){
  const clientId = getSavedClientId();
  if($("googleClientId")) $("googleClientId").value = clientId;
  if(!clientId){
    setGoogleStatus("Chưa cấu hình Client ID", false);
    updateGoogleUI();
    return;
  }
  const tryInit = ()=>{
    if(typeof google === "undefined" || !google.accounts || !google.accounts.oauth2){
      setTimeout(tryInit, 400);
      return;
    }
    try{
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE,
        callback: (resp)=>{
          if(resp.error){
            console.error(resp);
            setGoogleStatus("Đăng nhập thất bại: " + (resp.error_description || resp.error), false);
            googleAccessToken = null;
            updateGoogleUI();
            msg("Google lỗi: " + (resp.error_description || resp.error) + ". Kiểm tra Client ID và Authorized JavaScript origins.");
            return;
          }
          googleAccessToken = resp.access_token;
          updateGoogleUI();
          msg("Đã đăng nhập Google thành công.");
        },
        error_callback: (err)=>{
          console.error(err);
          msg("Không mở được cửa sổ đăng nhập Google. Kiểm tra origin (HTTPS/localhost) và Client ID.");
        }
      });
      updateGoogleUI();
    }catch(e){
      console.error(e);
      setGoogleStatus("Lỗi khởi tạo Google: " + e.message, false);
    }
  };
  tryInit();
}

function googleLogin(){
  const clientId = ($("googleClientId") && $("googleClientId").value.trim()) || getSavedClientId();
  if(!clientId || !clientId.includes("apps.googleusercontent.com")){
    msg("Hãy nhập đúng Google Client ID rồi bấm Lưu Client ID.");
    return;
  }
  localStorage.setItem("pf_google_client_id", clientId);
  if(!googleTokenClient){
    initGoogleApis();
    setTimeout(()=>{
      if(googleTokenClient) googleTokenClient.requestAccessToken({prompt: "consent"});
      else msg("Google script chưa sẵn sàng. Đợi 2 giây rồi thử lại.");
    }, 600);
    return;
  }
  // Re-create client if clientId changed
  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPE,
    callback: (resp)=>{
      if(resp.error){
        setGoogleStatus("Đăng nhập thất bại: " + (resp.error_description || resp.error), false);
        googleAccessToken = null;
        updateGoogleUI();
        msg("Google lỗi: " + (resp.error_description || resp.error));
        return;
      }
      googleAccessToken = resp.access_token;
      updateGoogleUI();
      msg("Đã đăng nhập Google thành công.");
    }
  });
  googleTokenClient.requestAccessToken({prompt: googleAccessToken ? "" : "consent"});
}

function googleLogout(){
  if(googleAccessToken && typeof google !== "undefined" && google.accounts){
    try{ google.accounts.oauth2.revoke(googleAccessToken, ()=>{}); }catch(e){}
  }
  googleAccessToken = null;
  updateGoogleUI();
  msg("Đã đăng xuất Google.");
}

async function driveFindLatestBackupId(){
  const fixedName = "TaiChinhCaNhan_latest.pfbackup";
  let q = "name = '" + fixedName + "' and trashed=false";
  let res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name)&q=" + encodeURIComponent(q), {
    headers: { "Authorization": "Bearer " + googleAccessToken }
  });
  if(res.ok){
    const data = await res.json();
    if(data.files && data.files.length) return data.files[0].id;
  }
  return null;
}

async function driveUploadBackup(){
  if(!googleAccessToken){ msg("Hãy đăng nhập Google trước."); return; }
  try{
    msg("Đang sao lưu lên Drive (ghi đè)...");
    const v = await readVault();
    if(!v) throw new Error("Không có dữ liệu để sao lưu");
    const payload = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      vault: v
    };
    const content = JSON.stringify(payload);
    const fixedName = "TaiChinhCaNhan_latest.pfbackup";
    const existingId = await driveFindLatestBackupId();

    if(existingId){
      const res = await fetch("https://www.googleapis.com/upload/drive/v3/files/" + existingId + "?uploadType=media", {
        method: "PATCH",
        headers: {
          "Authorization": "Bearer " + googleAccessToken,
          "Content-Type": "application/json"
        },
        body: content
      });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t || ("HTTP " + res.status));
      }
      msg("Đã ghi đè bản sao lưu trên Google Drive.");
    }else{
      // multipart create
      const metadata = { name: fixedName, mimeType: "application/json" };
      const boundary = "pfboundary" + Date.now();
      const body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" +
        content + "\r\n--" + boundary + "--";
      const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + googleAccessToken,
          "Content-Type": "multipart/related; boundary=" + boundary
        },
        body: body
      });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t || ("HTTP " + res.status));
      }
      msg("Đã tạo bản sao lưu trên Google Drive.");
    }
  }catch(e){
    console.error(e);
    let m = e.message || String(e);
    if(m.includes("401") || m.includes("Invalid Credentials")) m = "Token hết hạn. Hãy Đăng xuất rồi Đăng nhập Google lại.";
    if(m.includes("403")) m = "Không có quyền Drive. Kiểm tra scope và đã bật Google Drive API.";
    msg("Sao lưu Drive thất bại: " + m);
  }
}

async function driveListBackups(){
  let files = [];
  let q = "name = 'TaiChinhCaNhan_latest.pfbackup' and trashed=false";
  let res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name,createdTime)&q=" + encodeURIComponent(q), {
    headers: { "Authorization": "Bearer " + googleAccessToken }
  });
  if(res.ok){
    const data = await res.json();
    if(data.files) files = files.concat(data.files);
  }
  q = "name contains 'TaiChinhCaNhan_' and name contains '.pfbackup' and trashed=false";
  res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,createdTime)&q=" + encodeURIComponent(q) + "&orderBy=createdTime desc", {
    headers: { "Authorization": "Bearer " + googleAccessToken }
  });
  if(res.ok){
    const data = await res.json();
    const ids = new Set(files.map(f=>f.id));
    for(const f of (data.files||[])) if(!ids.has(f.id)) files.push(f);
  }
  return files;
}

async function driveRestoreBackup(){
  if(!googleAccessToken){ msg("Hãy đăng nhập Google trước."); return; }
  try{
    msg("Đang tìm file sao lưu trên Drive...");
    const files = await driveListBackups();
    if(!files.length){
      msg("Không tìm thấy file .pfbackup trên Drive. Hãy sao lưu trước.");
      return;
    }
    let listText = files.map((f,i)=> (i+1) + ". " + f.name + " (" + ((f.createdTime||"").slice(0,10)) + ")").join("\n");
    let choice = prompt("Chọn số thứ tự file muốn khôi phục:\n\n" + listText, "1");
    if(!choice) return;
    let idx = parseInt(choice,10) - 1;
    if(isNaN(idx) || idx<0 || idx>=files.length){ msg("Lựa chọn không hợp lệ."); return; }
    if(!confirm("Khôi phục sẽ thay thế dữ liệu hiện tại bằng:\n" + files[idx].name + "\nTiếp tục?")) return;

    const res = await fetch("https://www.googleapis.com/drive/v3/files/" + files[idx].id + "?alt=media", {
      headers: { "Authorization": "Bearer " + googleAccessToken }
    });
    if(!res.ok) throw new Error(await res.text());
    const text = await res.text();
    const p = JSON.parse(text);
    if(p.format !== BACKUP_FORMAT || !p.vault || !p.vault.ciphertext) throw new Error("File không hợp lệ.");
    let pin = prompt("Nhập PIN của file sao lưu:");
    if(!pin) return;
    let k = await derive(pin, un64(p.vault.salt));
    let d = normalize(await dec(p.vault, k));
    await writeVault(p.vault);
    cryptoKey = k;
    window.localSalt = p.vault.salt;
    appData = d;
    txDisplayLimit = 50;
    render();
    msg("Đã khôi phục từ Google Drive thành công.");
  }catch(e){
    console.error(e);
    msg("Khôi phục Drive thất bại: " + (e.message || e));
  }
}


/* ========== BIOMETRIC (WebAuthn) – tối ưu Android ========== */
const BIO_CRED_KEY = "pf_webauthn_cred";
const BIO_PIN_KEY = "pf_bio_pin";

function bioSupported(){
  try{
    return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  }catch(e){ return false; }
}

async function bioPlatformAvailable(){
  if(!bioSupported()) return false;
  try{
    if(typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"){
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  }catch(e){}
  return true; // assume possible
}

function getRpId(){
  // Android Chrome requires exact host; never use empty
  const h = location.hostname;
  if(!h || h === "localhost" || h === "127.0.0.1") return "localhost";
  return h;
}

function updateBioUI(){
  const has = !!localStorage.getItem(BIO_CRED_KEY) && !!localStorage.getItem(BIO_PIN_KEY);
  const secure = !!window.isSecureContext;
  if($("bioStatus")){
    if(!secure){
      $("bioStatus").textContent = "Cần HTTPS hoặc localhost mới dùng vân tay được.";
    }else if(!bioSupported()){
      $("bioStatus").textContent = "Trình duyệt không hỗ trợ WebAuthn.";
    }else if(has){
      $("bioStatus").textContent = "Đã đăng ký vân tay / Face ID — mở khóa không cần gõ PIN.";
    }else{
      $("bioStatus").textContent = "Chưa đăng ký. Mở khóa bằng PIN trước, rồi bấm Đăng ký.";
    }
  }
  if($("bioUnlockBtn")) $("bioUnlockBtn").classList.toggle("hidden", !has || !secure);
  if($("bioRegisterBtn")) $("bioRegisterBtn").disabled = !secure || !bioSupported() || !cryptoKey;
  if($("bioRemoveBtn")) $("bioRemoveBtn").disabled = !has;
}

async function bioRegister(){
  if(!window.isSecureContext){
    msg("Vân tay chỉ hoạt động trên HTTPS hoặc localhost. Hãy cài app từ GitHub Pages / Add to Home screen.");
    return;
  }
  if(!bioSupported()){ msg("Trình duyệt không hỗ trợ vân tay / Face ID."); return; }
  if(!cryptoKey){ msg("Hãy mở khóa bằng PIN trước khi đăng ký vân tay."); return; }

  const available = await bioPlatformAvailable();
  if(!available){
    msg("Thiết bị không có vân tay/Face ID dùng được với trình duyệt này.");
    return;
  }

  let pin = prompt("Nhập lại PIN hiện tại để liên kết vân tay / Face ID:");
  if(!pin) return;
  try{
    let v = await readVault();
    if(!v) throw new Error("no vault");
    let k = await derive(pin, un64(v.salt));
    await dec(v, k);
  }catch(e){
    msg("PIN không đúng.");
    return;
  }

  try{
    // Remove old credential first
    localStorage.removeItem(BIO_CRED_KEY);
    localStorage.removeItem(BIO_PIN_KEY);

    const userId = crypto.getRandomValues(new Uint8Array(16));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rpId = getRpId();

    const publicKey = {
      challenge,
      rp: { name: "Tai chinh ca nhan", id: rpId },
      user: {
        id: userId,
        name: "user@" + rpId,
        displayName: "Tai chinh"
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
        requireResidentKey: false
      },
      timeout: 90000,
      attestation: "none"
    };

    const cred = await navigator.credentials.create({ publicKey });
    if(!cred || !cred.rawId) throw new Error("Không nhận được credential từ thiết bị");

    const rawId = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(cred.rawId))));
    localStorage.setItem(BIO_CRED_KEY, rawId);
    localStorage.setItem(BIO_PIN_KEY, btoa(unescape(encodeURIComponent(pin))));
    // Also remember rpId used
    localStorage.setItem("pf_bio_rpid", rpId);

    updateBioUI();
    msg("Đăng ký vân tay / Face ID thành công. Lần sau chỉ cần chạm vân tay.");
  }catch(e){
    console.error("bioRegister", e);
    let m = e.message || e.name || String(e);
    if(e.name === "NotAllowedError") m = "Bạn đã hủy hoặc thiết bị từ chối. Thử lại và xác nhận vân tay khi hệ thống hỏi.";
    if(e.name === "InvalidStateError") m = "Vân tay đã đăng ký trước đó. Bấm Hủy đăng ký rồi đăng ký lại.";
    if(e.name === "SecurityError") m = "Lỗi bảo mật (rpId/origin). App phải chạy đúng domain HTTPS đã cài.";
    msg("Đăng ký thất bại: " + m);
  }
}

async function bioUnlock(){
  if(!window.isSecureContext){
    $("unlockError").textContent = "Cần HTTPS hoặc localhost.";
    return;
  }
  const stored = localStorage.getItem(BIO_CRED_KEY);
  const encPin = localStorage.getItem(BIO_PIN_KEY);
  if(!stored || !encPin){
    $("unlockError").textContent = "Chưa đăng ký vân tay trên thiết bị này.";
    return;
  }
  try{
    $("unlockError").textContent = "Đang chờ vân tay / Face ID...";
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rawId = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const rpId = localStorage.getItem("pf_bio_rpid") || getRpId();

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{
          type: "public-key",
          id: rawId,
          transports: ["internal"]
        }],
        userVerification: "required",
        timeout: 90000
      }
    });
    if(!assertion) throw new Error("Xác thực thất bại");

    const pin = decodeURIComponent(escape(atob(encPin)));
    $("unlockError").textContent = "";
    await unlock(pin);
    msg("Đã mở khóa bằng vân tay / Face ID.");
  }catch(e){
    console.error("bioUnlock", e);
    if(e.name === "NotAllowedError"){
      $("unlockError").textContent = "Đã hủy hoặc vân tay không khớp. Thử lại.";
    }else if(e.name === "SecurityError"){
      $("unlockError").textContent = "Lỗi domain/HTTPS. Mở đúng địa chỉ đã đăng ký.";
    }else{
      $("unlockError").textContent = "Không mở được: " + (e.message || e.name);
    }
  }
}

function bioRemove(){
  localStorage.removeItem(BIO_CRED_KEY);
  localStorage.removeItem(BIO_PIN_KEY);
  localStorage.removeItem("pf_bio_rpid");
  updateBioUI();
  msg("Đã hủy đăng ký vân tay / Face ID.");
}

function wireGoogleButtons(){
  if($("saveClientIdBtn")){
    $("saveClientIdBtn").onclick = ()=>{
      const id = ($("googleClientId").value || "").trim();
      if(!id || !id.includes(".apps.googleusercontent.com")){
        msg("Client ID không hợp lệ. Phải dạng xxxxx.apps.googleusercontent.com");
        return;
      }
      localStorage.setItem("pf_google_client_id", id);
      msg("Đã lưu Client ID.");
      initGoogleApis();
    };
  }
  if($("googleLoginBtn")) $("googleLoginBtn").onclick = googleLogin;
  if($("googleLogoutBtn")) $("googleLogoutBtn").onclick = googleLogout;
  if($("driveBackupBtn")) $("driveBackupBtn").onclick = ()=>driveUploadBackup();
  if($("driveRestoreBtn")) $("driveRestoreBtn").onclick = ()=>driveRestoreBackup();
  if($("bioRegisterBtn")) $("bioRegisterBtn").onclick = bioRegister;
  if($("bioRemoveBtn")) $("bioRemoveBtn").onclick = bioRemove;
  if($("bioUnlockBtn")) $("bioUnlockBtn").onclick = bioUnlock;
  updateBioUI();
  updateGoogleUI();
}

async function init(){
  if(!crypto?.subtle||!indexedDB){
    document.body.innerHTML="<p>Trình duyệt không hỗ trợ lưu trữ/mã hóa cần thiết.</p>";
    return;
  }
  db=await openDb();
  const hasVault = !!(await readVault());
  showOnly(hasVault?"unlockPanel":"setupPanel");
  updateBioUI();
  // Android: nếu đã đăng ký vân tay thì tự gợi ý sau 400ms
  if(hasVault && localStorage.getItem("pf_webauthn_cred") && window.isSecureContext){
    setTimeout(()=>{ if($("bioUnlockBtn") && !$("bioUnlockBtn").classList.contains("hidden")) { /* chỉ hiện nút, không auto-trigger (tránh bị chặn) */ } }, 300);
  }
  if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost"))
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  wireGoogleButtons();
  initGoogleApis();
}
init().catch(e=>msg("Không thể khởi tạo: "+e.message));
