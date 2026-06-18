const VERSION = "2.3.1";
const DEFAULTS = { type:"custom:waveshare-ups-card", title:"UPS Power", layout:"auto", metric_columns:2,
  show_actions:true, show_battery_health:true, show_test_history:true, show_status_badge:true,
  low_battery_threshold:25, warning_battery_threshold:50 };

const FIELDS = [
  ["battery_entity","Battery % sensor","sensor"],["runtime_entity","Runtime sensor","sensor"],
  ["status_entity","Status entity",["binary_sensor","sensor"]],["output_source_entity","Output source sensor","sensor"],
  ["battery_state_entity","Battery state entity",["binary_sensor","sensor"]],["battery_voltage_entity","Battery voltage sensor","sensor"],
  ["supply_voltage_entity","Supply voltage sensor","sensor"],["current_entity","Current sensor","sensor"],
  ["power_entity","Power sensor","sensor"],["output_entity","Output sensor","sensor"],
  ["battery_age_entity","Battery age sensor","sensor"],["battery_fault_entity","Battery fault entity",["binary_sensor","sensor"]],
  ["maintenance_entity","Battery maintenance entity",["binary_sensor","sensor"]],["last_battery_change_entity","Last battery change sensor","sensor"],
  ["self_test_status_entity","Self-test status sensor","sensor"],["last_self_test_status_entity","Last self-test status sensor","sensor"],
  ["last_self_test_date_entity","Last self-test date sensor","sensor"],["calibration_status_entity","Calibration status sensor","sensor"],
  ["calibration_elapsed_entity","Calibration elapsed sensor","sensor"],["last_calibration_status_entity","Last calibration status sensor","sensor"],
  ["last_runtime_calibration_entity","Last runtime calibration sensor","sensor"],
  ["start_self_test_button","Start self-test button","button"],["cancel_self_test_button","Cancel self-test button","button"],
  ["start_runtime_calibration_button","Start calibration button","button"],["cancel_runtime_calibration_button","Cancel calibration button","button"],
  ["battery_replaced_button","Battery replaced button","button"]
];
const LABELS = Object.fromEntries(FIELDS.map(([key,label])=>[key,label]));
Object.assign(LABELS,{title:"Card title",layout:"Layout",metric_columns:"Metric columns",show_actions:"Show controls",
  show_battery_health:"Show battery health",show_test_history:"Show test and calibration",show_status_badge:"Show status badge",
  low_battery_threshold:"Low battery threshold",warning_battery_threshold:"Warning battery threshold",
  ups_entity:"Main UPS entity"});
const SCHEMA = [
  {name:"title",selector:{text:{}}},
  {name:"ups_entity",selector:{entity:{}}},
  {name:"layout",selector:{select:{options:[{value:"auto",label:"Auto (recommended)"},{value:"full",label:"Full"},{value:"compact",label:"Compact"},{value:"minimal",label:"Minimal"}]}}},
  {name:"metric_columns",selector:{select:{options:[{value:1,label:"1 column"},{value:2,label:"2 columns"}]}}},
  ...["show_status_badge","show_battery_health","show_test_history","show_actions"].map(name=>({name,selector:{boolean:{}}})),
  {name:"low_battery_threshold",selector:{number:{min:0,max:100,mode:"box",unit_of_measurement:"%"}}},
  {name:"warning_battery_threshold",selector:{number:{min:0,max:100,mode:"box",unit_of_measurement:"%"}}},
  ...FIELDS.map(([name,,domain])=>({name,selector:{entity:{domain}}}))
];
const esc = value => String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

const MATCHERS = {
  battery_entity:[/battery_(capacity|percentage|level)/,/battery$/,/capacity$/],
  runtime_entity:[/estimated_runtime/,/runtime/,/time_remaining/], status_entity:[/ups_status$/,/status$/],
  output_source_entity:[/output_source/,/power_source/,/source$/], battery_state_entity:[/battery_state/],
  battery_voltage_entity:[/battery_voltage/], supply_voltage_entity:[/(supply|input)_voltage/],
  current_entity:[/(^|_)current$/], power_entity:[/(^|_)power$/], output_entity:[/output_(load|percentage)/,/output$/],
  battery_age_entity:[/battery_age/], battery_fault_entity:[/battery_fault/,/fault$/],
  maintenance_entity:[/battery_maintenance/,/maintenance/], last_battery_change_entity:[/last_battery_change/],
  self_test_status_entity:[/^self_test_status$/,/self_test/], last_self_test_status_entity:[/last_self_test_status/],
  last_self_test_date_entity:[/last_self_test_date/], calibration_status_entity:[/^calibration_status$/],
  calibration_elapsed_entity:[/calibration_elapsed/], last_calibration_status_entity:[/last_calibration_status/],
  last_runtime_calibration_entity:[/last_runtime_calibration/], start_self_test_button:[/start_self_test/],
  cancel_self_test_button:[/cancel_self_test/], start_runtime_calibration_button:[/start_(runtime_)?calibration/],
  cancel_runtime_calibration_button:[/cancel_(runtime_)?calibration/], battery_replaced_button:[/battery_replaced/]
};
const DEVICE_CLASSES = {battery_entity:"battery",runtime_entity:"duration",status_entity:"connectivity",battery_state_entity:"battery_charging",battery_voltage_entity:"voltage",
  supply_voltage_entity:"voltage",current_entity:"current",power_entity:"power"};

async function entityRegistry(hass){
  if(hass.entities&&Object.keys(hass.entities).length){
    const entries=Object.entries(hass.entities).map(([entity_id,entry])=>({entity_id,...entry}));
    if(entries.some(entry=>entry.device_id))return entries;
  }
  try{return await hass.callWS({type:"config/entity_registry/list"});}catch(error){console.warn("Waveshare UPS Card: entity discovery unavailable",error);return[];}
}

async function populateFromDevice(config,hass){
  if(!config.ups_entity)return config;
  const registry=await entityRegistry(hass),main=registry.find(entry=>entry.entity_id===config.ups_entity);
  if(!main?.device_id)return config;
  const deviceEntities=registry.filter(entry=>entry.device_id===main.device_id&&!entry.disabled_by);
  const result={...config},used=new Set(FIELDS.map(([key])=>config[key]).filter(Boolean));
  for(const [key,,domain] of FIELDS){
    if(result[key])continue;
    const patterns=MATCHERS[key]||[];
    const domains=Array.isArray(domain)?domain:[domain];
    const candidates=deviceEntities.filter(entry=>domains.includes(entry.entity_id.split(".")[0])&&!used.has(entry.entity_id));
    let best=null,bestScore=0;
    for(const entry of candidates){
      const slug=entry.entity_id.split(".")[1],text=`${slug} ${entry.name||""} ${entry.original_name||""}`.toLowerCase().replaceAll(/[^a-z0-9]+/g,"_");
      let score=0;
      if(key==="status_entity"&&/(calibration|self_test)_status$/.test(slug))continue;
      patterns.forEach((pattern,index)=>{if(pattern.test(slug))score=Math.max(score,(patterns.length-index)*10);else if(pattern.test(text))score=Math.max(score,patterns.length-index);});
      if(key==="status_entity"&&entry.entity_id.startsWith("binary_sensor."))score+=10;
      const expectedClass=DEVICE_CLASSES[key];
      if(expectedClass&&expectedClass===hass.states[entry.entity_id]?.attributes?.device_class)score=Math.max(score,5);
      if(score>0&&key.startsWith("last_")&&slug.includes("last_"))score+=20;
      if(score>0&&!key.startsWith("last_")&&slug.includes("last_"))score-=20;
      if(score>bestScore){best=entry.entity_id;bestScore=score;}
    }
    if(best){result[key]=best;used.add(best);}
  }
  return result;
}

function normalizeConfig(config){
  const result={...DEFAULTS,...config};
  if(result.ups_entity&&/(calibration|self_test)_status$/.test(result.status_entity||""))delete result.status_entity;
  return result;
}

class WaveshareUpsCardEditor extends HTMLElement {
  setConfig(config){ this.config=normalizeConfig(config); this.render(); }
  set hass(hass){ this._hass=hass; this.render(); }
  render(){
    if(!this._hass||!this.config)return;
    if(!this.form){
      this.innerHTML='<style>.note{margin:4px 0 14px;color:var(--secondary-text-color);font-size:12px;line-height:1.4}</style><div class="note">Select any entity from the UPS to discover its device entities automatically. Waveshare names are recognized directly; individual selections override discovery.</div><ha-form></ha-form>';
      this.form=this.querySelector("ha-form");
      this.form.addEventListener("value-changed",async event=>{
        let config={...this.config,...event.detail.value};
        Object.keys(config).forEach(key=>config[key]===""&&delete config[key]);
        if(config.ups_entity&&config.ups_entity!==this.config.ups_entity)config=await populateFromDevice(config,this._hass);
        this.config=config;
        this.form.data=config;
        this.dispatchEvent(new CustomEvent("config-changed",{detail:{config},bubbles:true,composed:true}));
      });
    }
    this.form.hass=this._hass; this.form.data=this.config; this.form.schema=SCHEMA;
    this.form.computeLabel=schema=>LABELS[schema.name]||schema.name;
  }
}

class WaveshareUpsCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  static getStubConfig(){return {...DEFAULTS};}
  static getConfigElement(){return document.createElement("waveshare-ups-card-editor");}
  setConfig(config){if(!config)throw Error("Invalid configuration");this.config=normalizeConfig(config);this.resolvedConfig=null;this.discoveryKey=null;this.discover();this.render();}
  set hass(hass){this._hass=hass;this.discover();this.render();}
  async discover(){
    if(!this._hass||!this.config?.ups_entity)return;
    const key=this.config.ups_entity+FIELDS.map(([field])=>this.config[field]||"").join("|");
    if(key===this.discoveryKey)return;
    this.discoveryKey=key;
    this.resolvedConfig=await populateFromDevice(this.config,this._hass);
    if(key===this.discoveryKey)this.render();
  }
  getCardSize(){return this.config?.layout==="full"?6:this.config?.layout==="compact"?5:this.config?.layout==="minimal"?2:4;}
  getGridOptions(){return{rows:"auto",columns:6,min_rows:2,min_columns:3};}
  obj(id){return id&&this._hass?this._hass.states[id]:undefined;}
  state(id,fallback="-"){const o=this.obj(id);if(!o||["unknown","unavailable"].includes(o.state))return fallback;const u=o.attributes?.unit_of_measurement;return u?`${o.state} ${u}`:o.state;}
  raw(id){return this.obj(id)?.state??"";}
  number(id){const n=Number(this.raw(id));return Number.isFinite(n)?n:null;}
  color(n){if(n===null)return"var(--disabled-text-color,#999)";if(n<=this.config.low_battery_threshold)return"var(--error-color,#db4437)";if(n<=this.config.warning_battery_threshold)return"var(--warning-color,#f4b400)";return n<80?"var(--accent-color,#03a9f4)":"var(--success-color,#0f9d58)";}
  status(config=this.config){
    const status=this.raw(config.status_entity).toLowerCase(),source=this.raw(config.output_source_entity).toLowerCase();
    const batt=this.raw(config.battery_state_entity).toLowerCase(),fault=this.raw(config.battery_fault_entity).toLowerCase();
    const maint=this.raw(config.maintenance_entity).toLowerCase(),meaningful=v=>v&&!['clear','none','off','unknown','unavailable','not required'].includes(v);
    if(meaningful(fault))return{label:"Fault",sub:this.state(config.battery_fault_entity),cls:"danger",icon:"mdi:alert-octagon"};
    if(meaningful(maint))return{label:"Maintenance",sub:this.state(config.maintenance_entity),cls:"warn",icon:"mdi:wrench-clock"};
    if(source.includes("battery")||status.includes("battery"))return{label:"On battery",sub:"Utility power is not supplying output",cls:"warn",icon:"mdi:power-plug-off"};
    if(batt.includes("charging")||batt==="on")return{label:"Online",sub:"Utility power - Charging",cls:"good",icon:"mdi:flash"};
    if(status.includes("online")||status==="on"||source.includes("utility"))return{label:"Online",sub:"Utility power",cls:"good",icon:"mdi:power-plug"};
    if(status==="off")return{label:"Offline",sub:"UPS is unavailable",cls:"danger",icon:"mdi:power-plug-off"};
    return{label:this.state(config.status_entity),sub:this.state(config.output_source_entity),cls:"neutral",icon:"mdi:server"};
  }
  more(id){if(!id)return;const e=new Event("hass-more-info",{bubbles:true,composed:true});e.detail={entityId:id};this.dispatchEvent(e);}
  press(id,label){if(this.obj(id)&&confirm(`Run UPS action: ${label}?`))this._hass.callService("button","press",{entity_id:id});}
  metric(label,id,icon){return id?`<button class="metric" data-entity="${esc(id)}"><ha-icon icon="${icon}"></ha-icon><div><span>${label}</span><strong>${esc(this.state(id))}</strong></div></button>`:"";}
  row(label,id){return id?`<button class="row" data-entity="${esc(id)}"><span>${label}</span><strong>${esc(this.state(id))}</strong></button>`:"";}
  indicator(label,id,icon,alert=false){
    if(!id)return"";
    const raw=this.raw(id).toLowerCase();
    let cls="neutral",text=`${label}: ${this.state(id)}`;
    if(!this.obj(id)||["unknown","unavailable",""].includes(raw))text=`${label}: Unavailable`;
    else if(alert){cls=raw==="on"?"danger":"good";text=raw==="on"?label:`${label}: Clear`;}
    else if(/progress|running|active/.test(raw))cls="warn";else if(/passed|complete|success/.test(raw))cls="good";
    return `<button class="indicator ${cls}" data-entity="${esc(id)}" title="${esc(text)}"><ha-icon icon="${icon}"></ha-icon><span>${esc(text)}</span></button>`;
  }
  action(label,id,icon,cls=""){return id?`<button class="action ${cls}" data-action="${esc(id)}" data-label="${label}" title="${label}" aria-label="${label}" ${this.obj(id)?"":"disabled"}><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`:"";}
  render(){
    if(!this._hass||!this.config)return;
    const c=this.resolvedConfig||this.config,s=this.status(c),raw=this.number(c.battery_entity),battery=raw===null?null:Math.max(0,Math.min(100,raw));
    const circumference=2*Math.PI*44,dash=((battery??0)/100)*circumference,layout=c.layout||"auto",minimal=layout==="minimal",compact=layout==="compact",full=layout==="full";
    const batteryState=this.raw(c.battery_state_entity).toLowerCase(),batteryLabel=batteryState==="on"?"Charging":batteryState==="off"?"Battery":this.state(c.battery_state_entity,"Battery");
    const metrics=this.metric("Battery Voltage",c.battery_voltage_entity,"mdi:lightning-bolt")+this.metric("Supply Voltage",c.supply_voltage_entity,"mdi:sine-wave")+this.metric("Current",c.current_entity,"mdi:current-dc")+this.metric("Power",c.power_entity,"mdi:gauge");
    const indicators=this.indicator("Battery Fault",c.battery_fault_entity,"mdi:battery-alert",true)+this.indicator("Maintenance",c.maintenance_entity,"mdi:wrench",true)+this.indicator("Self-Test",c.self_test_status_entity,"mdi:battery-check");
    const health=this.row("Battery Age",c.battery_age_entity)+this.row("Last Battery Change",c.last_battery_change_entity);
    const tests=this.row("Last Self-Test",c.last_self_test_status_entity)+this.row("Last Self-Test Date",c.last_self_test_date_entity)+this.row("Calibration",c.calibration_status_entity)+this.row("Elapsed",c.calibration_elapsed_entity)+this.row("Last Calibration",c.last_calibration_status_entity)+this.row("Last Runtime Calibration",c.last_runtime_calibration_entity);
    const actions=this.action("Start Self-Test",c.start_self_test_button,"mdi:clipboard-pulse","primary")+this.action("Cancel Self-Test",c.cancel_self_test_button,"mdi:cancel","danger")+this.action("Start Calibration",c.start_runtime_calibration_button,"mdi:timer-sync")+this.action("Cancel Calibration",c.cancel_runtime_calibration_button,"mdi:timer-off","danger")+this.action("Battery Replaced",c.battery_replaced_button,"mdi:battery-sync");
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;min-width:0}ha-card{container-type:inline-size;overflow:hidden}*{box-sizing:border-box}button{font:inherit}.card{padding:18px;min-width:0}.compact,.minimal{padding:14px}
      .header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}.heading{min-width:0}.title{font-size:20px;font-weight:650;overflow-wrap:anywhere}.subtitle{margin-top:4px;color:var(--secondary-text-color);font-size:13px;overflow-wrap:anywhere}
      .badge{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:999px;background:var(--secondary-background-color);font-size:12px;font-weight:700;white-space:nowrap}.badge.good{color:var(--success-color,#0f9d58)}.badge.warn{color:var(--warning-color,#f4b400)}.badge.danger{color:var(--error-color,#db4437)}
      .hero{display:flex;align-items:center;gap:18px;min-width:0;flex-wrap:wrap}.gauge{position:relative;flex:0 0 132px;width:132px;height:132px;display:grid;place-items:center;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}circle{fill:none;stroke-width:10}.track{stroke:var(--divider-color);opacity:.65}.progress{stroke-linecap:round}.gauge-value{z-index:1;text-align:center}.gauge-value strong{display:block;font-size:30px;line-height:1}.gauge-value span{display:block;max-width:90px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--secondary-text-color);font-size:12px}
      .runtime{flex:0 1 260px;min-width:180px;max-width:260px;padding:16px;border-radius:16px;background:var(--secondary-background-color)}.label{color:var(--secondary-text-color);font-size:13px}.runtime strong{display:block;margin-top:5px;font-size:28px;overflow-wrap:anywhere}.detail{margin-top:7px;color:var(--secondary-text-color);font-size:13px;overflow-wrap:anywhere}
      .indicators{flex:1 1 260px;display:flex;align-items:center;justify-content:flex-start;gap:18px;flex-wrap:wrap;min-width:0}.indicator{min-width:76px;display:grid;justify-items:center;gap:5px;padding:8px;border:0;background:transparent;color:var(--secondary-text-color);cursor:pointer}.indicator ha-icon{--mdc-icon-size:27px}.indicator span{font-size:11px;white-space:nowrap}.indicator.good{color:var(--success-color,#0f9d58)}.indicator.warn{color:var(--warning-color,#f4b400)}.indicator.danger{color:var(--error-color,#db4437)}
      .metrics{display:grid;grid-template-columns:repeat(${Number(c.metric_columns)===1?1:2},minmax(0,1fr));gap:10px;margin-top:16px}.metric{min-width:0;display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--divider-color);border-radius:14px;background:transparent;color:inherit;text-align:left;cursor:pointer}.metric ha-icon{flex:none;color:var(--secondary-text-color)}.metric div{min-width:0}.metric span{display:block;color:var(--secondary-text-color);font-size:12px}.metric strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .section{margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color)}.section-title{margin-bottom:8px;color:var(--secondary-text-color);font-size:13px;font-weight:700;text-transform:uppercase}.row{width:100%;min-width:0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:6px 0;border:0;background:transparent;color:inherit;cursor:pointer}.row span{color:var(--secondary-text-color);text-align:left}.row strong{min-width:0;overflow-wrap:anywhere;text-align:right}.icon-controls{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:14px;padding-top:12px;border-top:1px solid var(--divider-color)}.action{width:42px;height:42px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}.action ha-icon{--mdc-icon-size:24px}.action span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.action.primary{color:var(--primary-color)}.action.danger{color:var(--error-color,#db4437)}.action:disabled{opacity:.35}
      @container(min-width:700px){.auto .metrics{grid-template-columns:repeat(4,minmax(0,1fr))}}@container(max-width:520px){.hero{justify-content:center}.runtime{flex-basis:220px}.indicators{flex-basis:100%;justify-content:center}}@container(max-width:310px){.header{flex-direction:column}.runtime{width:100%;max-width:none;text-align:center}.metrics{grid-template-columns:1fr}.indicator span{white-space:normal;text-align:center}}
    </style><ha-card><div class="card ${esc(layout)}"><div class="header"><div class="heading"><div class="title">${esc(c.title)}</div>${minimal?"":`<div class="subtitle">${esc(s.sub)}</div>`}</div>${c.show_status_badge?`<div class="badge ${s.cls}"><ha-icon icon="${s.icon}"></ha-icon>${esc(s.label)}</div>`:""}</div>
      <div class="hero"><button class="gauge" data-entity="${esc(c.battery_entity||"")}" aria-label="Battery ${battery??"unavailable"} percent"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44"/><circle class="progress" cx="50" cy="50" r="44" style="stroke:${this.color(battery)};stroke-dasharray:${dash} ${circumference}"/></svg><div class="gauge-value"><strong>${battery===null?"--":`${Math.round(battery)}%`}</strong><span>${esc(batteryLabel)}</span></div></button><div class="runtime"><div class="label">Estimated Runtime</div><strong>${esc(this.state(c.runtime_entity))}</strong>${minimal?"":`<div class="detail">Output: ${esc(this.state(c.output_entity))}<br>Source: ${esc(this.state(c.output_source_entity))}</div>`}</div>${indicators?`<div class="indicators">${indicators}</div>`:""}</div>
      ${!minimal&&metrics?`<div class="metrics">${metrics}</div>`:""}${!minimal&&c.show_actions&&actions?`<div class="icon-controls">${actions}</div>`:""}${full&&c.show_battery_health&&health?`<div class="section"><div class="section-title">Battery Health</div>${health}</div>`:""}${full&&c.show_test_history&&tests?`<div class="section"><div class="section-title">Test & Calibration</div>${tests}</div>`:""}</div></ha-card>`;
    this.shadowRoot.querySelectorAll("[data-entity]").forEach(el=>el.addEventListener("click",()=>this.more(el.dataset.entity)));
    this.shadowRoot.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",()=>this.press(el.dataset.action,el.dataset.label)));
  }
}
if(!customElements.get("waveshare-ups-card-editor"))customElements.define("waveshare-ups-card-editor",WaveshareUpsCardEditor);
if(!customElements.get("waveshare-ups-card"))customElements.define("waveshare-ups-card",WaveshareUpsCard);
window.customCards=window.customCards||[];window.customCards.push({type:"waveshare-ups-card",name:"Waveshare UPS Card",description:"A responsive Waveshare UPS card with a visual editor.",preview:true,documentationURL:"https://github.com/ComputerWhisperers/Waveshare-UPS-Card"});
console.info(`%c WAVESHARE-UPS-CARD %c v${VERSION} `,"color:white;background:#1976d2;font-weight:bold","color:#1976d2;background:white");
