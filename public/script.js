const menuToggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('.main-nav');
function closeMobileMenu(returnFocus=false){
 nav?.classList.remove('open');
 menuToggle?.setAttribute('aria-expanded','false');
 menuToggle?.setAttribute('aria-label','Open navigation');
 document.body.classList.remove('nav-open');
 if(returnFocus)menuToggle?.focus();
}
menuToggle?.addEventListener('click',()=>{
 const open=nav.classList.toggle('open');
 menuToggle.setAttribute('aria-expanded',String(open));
 menuToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');
 document.body.classList.toggle('nav-open',open);
 if(open)nav.querySelector('a,button')?.focus();
 else menuToggle.focus();
});
document.querySelectorAll('.main-nav a').forEach(a=>a.addEventListener('click',()=>closeMobileMenu()));
const dropdownButton=document.querySelector('.nav-dropdown>button');
const dropdown=document.querySelector('.dropdown-menu');
function setDropdown(open){dropdown?.classList.toggle('open',open);dropdownButton?.setAttribute('aria-expanded',String(open));}
dropdownButton?.addEventListener('click',()=>setDropdown(!dropdown?.classList.contains('open')));
dropdownButton?.addEventListener('keydown',e=>{
 if(e.key==='ArrowDown'){e.preventDefault();setDropdown(true);dropdown?.querySelector('a')?.focus();}
});
dropdown?.querySelectorAll('a').forEach(link=>link.addEventListener('click',e=>{
 const target=[...document.querySelectorAll('[data-practice]')].find(card=>(card.dataset.practice||'').trim().toLowerCase()===link.textContent.trim().toLowerCase());
 if(target){e.preventDefault();setDropdown(false);closeMobileMenu();target.click();}
}));
dropdown?.querySelectorAll('a').forEach((a,i,all)=>a.addEventListener('keydown',e=>{
 if(e.key==='Escape'){setDropdown(false);dropdownButton?.focus();}
 if(e.key==='ArrowDown'){e.preventDefault();all[(i+1)%all.length]?.focus();}
 if(e.key==='ArrowUp'){e.preventDefault();all[(i-1+all.length)%all.length]?.focus();}
}));
document.addEventListener('click',e=>{if(!e.target.closest('.nav-dropdown'))setDropdown(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav?.classList.contains('open'))closeMobileMenu(true);});
document.getElementById('year').textContent=new Date().getFullYear();
// EDIT THESE FOUR VALUES IN ONE PLACE after the firm verifies the underlying claims.
const PUBLIC_CLAIMS={
 experience:'Since 1993',
 clientCount:'1,300+',
 successRate:'93%',
 approach:'Client-first'
};
document.querySelectorAll('[data-claim]').forEach(el=>{
 const value=PUBLIC_CLAIMS[el.dataset.claim];
 if(value)el.textContent=value;
});


// Refined sticky-header compression without layout-triggering scroll work.
const siteHeader=document.querySelector('.site-header');
let scrollFrame=false;
window.addEventListener('scroll',()=>{
 if(scrollFrame)return;
 scrollFrame=true;
 requestAnimationFrame(()=>{siteHeader?.classList.toggle('is-scrolled',window.scrollY>24);scrollFrame=false;});
},{passive:true});
// Pause decorative hero animation when it is outside the viewport.
const heroSection=document.querySelector('.hero-dark');
if(heroSection&&'IntersectionObserver' in window){
 const heroObserver=new IntersectionObserver(([entry])=>heroSection.classList.toggle('hero-paused',!entry.isIntersecting));
 heroObserver.observe(heroSection);
}

// Accessible practice-area detail dialogs
const practiceModal=document.getElementById('practiceDetailModal');
const practiceTitle=document.getElementById('practiceDetailTitle');
const practiceText=document.getElementById('practiceDetailText');
let practiceReturnFocus=null;
document.querySelectorAll('[data-practice]').forEach(card=>card.addEventListener('click',e=>{
 e.preventDefault();
 if(!practiceModal)return;
 practiceReturnFocus=card;
 practiceTitle.textContent=card.dataset.practice||'Practice area';
 practiceModal.querySelector('[data-open-booking]')?.setAttribute('data-practice-choice',card.dataset.practice||'');
 practiceText.textContent=card.dataset.description||'Contact the firm to learn more about this practice area.';
 practiceModal.classList.add('open');practiceModal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
 practiceModal.querySelector('.practice-detail-close')?.focus();
}));
document.querySelectorAll('[data-close-practice]').forEach(el=>el.addEventListener('click',()=>{practiceModal?.classList.remove('open');practiceModal?.setAttribute('aria-hidden','true');if(!bookingModal?.classList.contains('open'))document.body.classList.remove('modal-open');practiceReturnFocus?.focus()}));
practiceModal?.querySelectorAll('[data-open-booking]').forEach(el=>el.addEventListener('click',()=>{practiceModal.classList.remove('open');practiceModal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');practiceReturnFocus?.focus()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&practiceModal?.classList.contains('open')){practiceModal.classList.remove('open');practiceModal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');practiceReturnFocus?.focus();if(!bookingModal?.classList.contains('open'))document.body.classList.remove('modal-open');practiceReturnFocus?.focus()}});

attachImageFallbacks(document);
const cookieNotice=document.getElementById('cookieNotice');if(cookieNotice&&localStorage.getItem('aibangbee-cookie-notice')==='seen')cookieNotice.hidden=true;document.getElementById('cookieDismiss')?.addEventListener('click',()=>{localStorage.setItem('aibangbee-cookie-notice','seen');cookieNotice.hidden=true;});
const today=new Date();
const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(today);document.querySelectorAll('input[type="date"]').forEach(i=>i.min=localDate);
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});
 document.querySelectorAll('.value-card,.practice-card,.stat,.about-copy,.about-visual,.feature-content,.consult-copy,.consult-form,.appointment-intro,.appointment-form').forEach(el=>{el.classList.add('reveal');observer.observe(el)});
}

// Consultation booking modal and date/time preference calendar
const bookingModal=document.getElementById('bookingModal');
const bookingOpeners=document.querySelectorAll('[data-open-booking]');
const bookingClosers=document.querySelectorAll('[data-close-booking]');
let calendarCursor=new Date();calendarCursor.setDate(1);
// Keep this exact time-slot list in sync with ALLOWED_CONSULTATION_TIMES in server.js and the buttons in public/index.html.
const CLIENT_CONSULTATION_TIMES=['08:00 AM','09:00 AM','10:30 AM','01:00 PM','02:30 PM','04:00 PM','05:30 PM','07:00 PM','08:30 PM'];
let chosenDate='',chosenTime='',bookingReturnFocus=null;
const calendarDays=document.getElementById('calendarDays');
const monthLabel=document.getElementById('calendarMonth');
const dateField=document.getElementById('selectedDate');
const timeField=document.getElementById('selectedTime');
const timeSlots=document.getElementById('timeSlots');
function openBooking(e){e?.preventDefault();bookingReturnFocus=e?.currentTarget||document.activeElement;const previousStatus=document.getElementById('bookingStatus');previousStatus?.replaceChildren();previousStatus?.classList.remove('success');const choice=e?.currentTarget?.dataset?.practiceChoice;if(choice){const select=document.querySelector('#bookingForm [name=practice]');if(select)select.value=choice;}bookingModal?.classList.add('open');bookingModal?.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');renderCalendar();document.querySelector('.booking-close')?.focus();}
function closeBooking(){bookingModal?.classList.remove('open');bookingModal?.setAttribute('aria-hidden','true');if(!practiceModal?.classList.contains('open'))document.body.classList.remove('modal-open');bookingReturnFocus?.focus();}
bookingOpeners.forEach(el=>el.addEventListener('click',openBooking));
bookingClosers.forEach(el=>el.addEventListener('click',closeBooking));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&bookingModal?.classList.contains('open'))closeBooking();});
function dateISO(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function updateTimeAvailability(){
 if(!timeSlots)return;
 const nowParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const nowMinutes=Number(nowParts.find(x=>x.type==='hour')?.value||0)*60+Number(nowParts.find(x=>x.type==='minute')?.value||0);
 timeSlots.querySelectorAll('[data-time]').forEach(btn=>{
  const match=btn.dataset.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let disabled=false;
  if(chosenDate===localDate&&match){
   let hour=Number(match[1])%12;if(match[3].toUpperCase()==='PM')hour+=12;
   disabled=hour*60+Number(match[2])<=nowMinutes;
  }
  btn.disabled=disabled;
  btn.setAttribute('aria-disabled',String(disabled));
  if(disabled&&btn.dataset.time===chosenTime){chosenTime='';timeField.value='';btn.classList.remove('selected');}
 });
}
function renderCalendar(){
 if(!calendarDays||!monthLabel)return;
 const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
 monthLabel.textContent=calendarCursor.toLocaleDateString(undefined,{month:'long',year:'numeric'});
 calendarDays.innerHTML='';
 const first=new Date(y,m,1).getDay(),count=new Date(y,m+1,0).getDate();
 const now=new Date();now.setHours(0,0,0,0);
 for(let i=0;i<first;i++){const blank=document.createElement('span');blank.className='calendar-blank';calendarDays.appendChild(blank);}
 for(let d=1;d<=count;d++){
   const date=new Date(y,m,d);date.setHours(0,0,0,0);
   const btn=document.createElement('button');btn.type='button';btn.textContent=d;btn.className='calendar-day';
   const iso=dateISO(y,m,d);if(date<now || date.getDay()===0){btn.disabled=true;btn.classList.add('disabled');}
   if(iso===chosenDate)btn.classList.add('selected');
   btn.addEventListener('click',()=>{chosenDate=iso;dateField.value=iso;updateTimeAvailability();renderCalendar();});
   calendarDays.appendChild(btn);
 }
}
document.getElementById('prevMonth')?.addEventListener('click',()=>{const now=new Date();const thisMonth=new Date(now.getFullYear(),now.getMonth(),1);const prev=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);if(prev>=thisMonth){calendarCursor=prev;renderCalendar();}});
document.getElementById('nextMonth')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();});
timeSlots?.querySelectorAll('[data-time]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.disabled||!CLIENT_CONSULTATION_TIMES.includes(btn.dataset.time))return;timeSlots.querySelectorAll('[data-time]').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');chosenTime=btn.dataset.time;timeField.value=chosenTime;}));
document.getElementById('bookingForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget;const status=document.getElementById('bookingStatus');
 if(!form.reportValidity())return;
 if(!chosenDate){status.textContent='Please choose a preferred date on the calendar.';return;}
 if(!chosenTime){status.textContent='Please choose a preferred time.';return;}
 const data=Object.fromEntries(new FormData(form).entries());data.privacyConsent=!!form.querySelector('[name=privacyConsent]')?.checked;
 if(data.date<localDate){status.textContent='Please choose a future date.';return;}
 const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent='Sending request…';status.textContent='';
 try{
  const response=await fetch('/api/consultations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Unable to submit your request.');
  status.classList.add('success');
  status.replaceChildren();
  const confirmation=document.createElement('p');
  confirmation.textContent=`Thank you, ${data.name}. Your consultation request for ${data.practice} on ${new Date(`${data.date}T12:00:00`).toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} at ${data.time} WAT has been received successfully. Please check your email for further details within 24 hours. Our team will review your request and contact you to confirm the appointment. Your reference is ${result.reference}.`;
  const toUtc=(date,time)=>{const m=time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);let hour=Number(m[1])%12;if(m[3].toUpperCase()==='PM')hour+=12;return new Date(`${date}T${String(hour).padStart(2,'0')}:${m[2]}:00+01:00`);};
  const formatUtc=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const startUtc=formatUtc(toUtc(data.date,data.time)),endUtc=formatUtc(new Date(toUtc(data.date,data.time).getTime()+3600000));
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Aibangbee Law Firm//Consultation Request//EN','BEGIN:VEVENT',`UID:${result.reference}@aibangbee-law-firm`,`DTSTAMP:${formatUtc(new Date())}`,`DTSTART:${startUtc}`,`DTEND:${endUtc}`,'SUMMARY:Aibangbee Law Firm - consultation request (pending confirmation)',`DESCRIPTION:Requested time only. The firm will contact you to confirm availability. Reference ${result.reference}.`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const calendarLink=document.createElement('a');calendarLink.className='button button-outline';calendarLink.textContent='Add to calendar';calendarLink.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));calendarLink.download=`${result.reference}.ics`;
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='button button-outline';closeButton.textContent='Close';closeButton.addEventListener('click',closeBooking);
  const popup=document.createElement('div');popup.className='booking-confirmation-popup';popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-labelledby','booking-confirmation-title');
  const panel=document.createElement('div');panel.className='booking-confirmation-panel';
  const mark=document.createElement('span');mark.className='booking-confirmation-mark';mark.textContent='✓';
  const title=document.createElement('h2');title.id='booking-confirmation-title';title.textContent='Request received';
  const note=document.createElement('p');note.textContent='Thank you for contacting Aibangbee Law Firm. Your consultation request has been received. Please check your email within 24 hours for further details. Our team will review your request and contact you to confirm the appointment.';
  const ref=document.createElement('p');ref.className='booking-confirmation-reference';ref.textContent=`Reference: ${result.reference}`;
  panel.append(mark,title,note,ref,calendarLink,closeButton);popup.append(panel);document.body.append(popup);
  closeButton.addEventListener('click',()=>{popup.remove();closeBooking()});
  popup.addEventListener('click',ev=>{if(ev.target===popup){popup.remove();closeBooking()}});
  panel.querySelector('button')?.focus();
  form.reset();chosenDate='';chosenTime='';dateField.value='';timeField.value='';timeSlots?.querySelectorAll('[data-time]').forEach(b=>b.classList.remove('selected'));
 }catch(err){status.textContent=err instanceof TypeError?'Connection problem. Your details are still here. Check your connection and try again, or call 0802 329 8459.':(err.message||'We could not send your request. Your details are still here; please try again.');}
 finally{submit.disabled=false;submit.innerHTML='Request appointment <span>↗</span>';}
});

const defaultCases=[];const defaultAttorneys=[];function safeTxt(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function publicImagePath(value,fallback=''){const path=String(value||fallback||'').trim();if(!path)return '';if(/^https:\/\//i.test(path))return path;if(path.startsWith('/'))return path;return '/'+path.replace(/^\.\//,'');}
function attachImageFallbacks(root){root?.querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{img.classList.add('image-unavailable');img.alt=img.alt||'Image unavailable';img.removeAttribute('src');img.style.minHeight='160px';img.style.background='linear-gradient(135deg,#eee8e2,#d9cec3)';img.style.objectFit='contain';},{once:true});});}
async function renderManaged(){
 let cs=defaultCases,ats=defaultAttorneys,news=[],faqs=[],practiceImages={},heroImage='',siteImages={};
 try{const response=await fetch('/api/public-content',{cache:'no-store'});if(response.ok){const data=await response.json();if(Array.isArray(data.cases))cs=data.cases;if(Array.isArray(data.attorneys))ats=data.attorneys;if(Array.isArray(data.news))news=data.news;if(Array.isArray(data.faqs))faqs=data.faqs;if(data.practiceImages&&typeof data.practiceImages==='object')practiceImages=data.practiceImages;if(typeof data.heroImage==='string')heroImage=data.heroImage;if(data.siteImages&&typeof data.siteImages==='object')siteImages=data.siteImages;}}catch(_){}
 const cg=document.getElementById('caseGrid'),ag=document.getElementById('attorneyGrid');
 if(cg)cg.innerHTML=cs.length?cs.map(x=>`<article class="case-card"><img src="${safeTxt(publicImagePath(x.image,'assets/business-law.jpg'))}" alt="${safeTxt(x.title)}" loading="lazy"><div class="case-card-body"><span class="tag">${safeTxt(x.area)}</span><h3>${safeTxt(x.title)}</h3><p>${safeTxt(x.description)}</p><div class="matter-result">${safeTxt(x.result)}</div></div></article>`).join(''):'<p class="empty-public-content">Case highlights will be published here when the firm has approved matters for public sharing.</p>';
 const heroSrc=siteImages.hero||heroImage;
 if(heroSrc){
  const safeHeroPath=publicImagePath(heroSrc).replaceAll('"','').replaceAll('\\','').replace(/[\r\n]/g,'');
  document.querySelector('.hero-dark')?.style.setProperty('--hero-photo','url("'+safeHeroPath+'")');
 }
 [['.about-visual>img',siteImages.about],['.feature-image img',siteImages.stand]].forEach(([sel,src])=>{const img=document.querySelector(sel);if(img&&src){img.src=publicImagePath(src);img.classList.add('has-photo')}});
 const ng=document.getElementById('newsGrid');if(ng)ng.innerHTML=news.length?news.slice(0,3).map(x=>`<article class="news-card"><a href="${safeTxt(x.url||'#legal-insights')}" ${x.url?'target="_blank" rel="noopener noreferrer"':''}><div class="news-image">${x.image?`<img src="${safeTxt(publicImagePath(x.image))}" alt="${safeTxt(x.title)}" loading="lazy">`:'<span>LEGAL BRIEFING</span>'}</div><div class="news-copy"><small>${safeTxt(x.category||'LEGAL INSIGHT')} ${x.date?' · '+safeTxt(x.date):''}</small><h3>${safeTxt(x.title)}</h3><p>${safeTxt(x.description)}</p><b>READ MORE ↗</b></div></a></article>`).join(''):'<p class="empty-public-content">New legal insights and firm updates will be published here.</p>';
 const fq=document.getElementById('faqList');if(fq)fq.innerHTML=faqs.length?faqs.map((x,i)=>`<details class="faq-item" ${i===0?'open':''}><summary>${safeTxt(x.question)}<span>＋</span></summary><p>${safeTxt(x.answer)}</p></details>`).join(''):'<p class="empty-public-content">Contact the firm if you have a question about our services.</p>';

 if(ag)ag.innerHTML=ats.length?ats.map(x=>`<article class="attorney-card"><img src="${safeTxt(publicImagePath(x.image,'assets/hero-attorney.jpg'))}" alt="Portrait of ${safeTxt(x.name)}" loading="lazy"><div class="attorney-card-body"><h3>${safeTxt(x.name)}</h3><div class="credentials">${safeTxt(x.title)} · ${safeTxt(x.qualifications)}</div><p>${safeTxt(x.bio)}</p></div></article>`).join(''):'<p class="empty-public-content">Attorney profiles will be added when the firm provides approved biographies and credentials.</p>';
 attachImageFallbacks(cg);attachImageFallbacks(ag);attachImageFallbacks(document.querySelector('.practice-grid'));
}
renderManaged();

// Keep keyboard focus inside whichever dialog is open.
document.addEventListener('keydown',e=>{
 const activeModal=bookingModal?.classList.contains('open')?bookingModal:(practiceModal?.classList.contains('open')?practiceModal:null);
 if(!activeModal||e.key!=='Tab')return;
 const items=[...activeModal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
 if(!items.length)return;
 const first=items[0],last=items[items.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
// Update the active navigation item as visitors move through the page.
if('IntersectionObserver' in window){
 const navLinks=[...document.querySelectorAll('.main-nav a[href^="#"]')];
 const sections=navLinks.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
 const spy=new IntersectionObserver(entries=>{
  const visible=entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
  if(!visible)return;
  navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+visible.target.id));
 },{rootMargin:'-28% 0px -62% 0px',threshold:[0,.15,.4]});
 sections.forEach(section=>spy.observe(section));
}

const backToTop=document.createElement('button');
backToTop.type='button';backToTop.className='back-to-top';backToTop.setAttribute('aria-label','Back to top');backToTop.textContent='↑';
document.body.appendChild(backToTop);
backToTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
const updateBackToTop=()=>backToTop.classList.toggle('visible',window.scrollY>600);
window.addEventListener('scroll',updateBackToTop,{passive:true});updateBackToTop();
