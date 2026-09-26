import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { describeEvent, getLeaders, getMatchSituation, getMomentum, getServingRun } from '../utils/spectator';

const META = {
  kill: ['⚡','#2ecc71'], ace: ['🎯','#3498db'], serve: ['🏐','#3498db'], spike: ['👊','#9b59b6'],
  dig: ['🤿','#1abc9c'], block: ['🛡️','#e67e22'], kill_block: ['🧱','#2ecc71'],
  assist: ['🤝','#95a5a6'], serve_error: ['❌','#e74c3c'], our_point: ['✅','#2ecc71'],
  opponent_point: ['🔴','#e74c3c'], foot_fault: ['👟','#e74c3c'], net_touch: ['🕸️','#e74c3c'],
  spike_error: ['❌','#e74c3c'], setter_dump: ['🎯','#8e44ad'], pass: ['🏐','#2980b9'],
};
const POSITION_COLORS = { Setter:'#8e44ad', Opposite:'#e67e22', 'Middle Blocker':'#c0392b', 'Outside Hitter':'#2980b9', Libero:'#d4ac0d' };

export default function SpectatorView() {
  const { matchId } = useParams();
  const [data,setData] = useState(null);
  const [spectators,setSpectators] = useState(null);
  const [error,setError] = useState(false);
  const [updated,setUpdated] = useState(null);
  const [technicalOpen,setTechnicalOpen] = useState(false);
  const [scoreOnly,setScoreOnly] = useState(false);
  const [notifications,setNotifications] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const previous = useRef(null);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/matches/${matchId}/spectator`);
        if (!response.ok) throw new Error();
        const next = await response.json();
        const old = previous.current;
        previous.current = next.score;
        if (old && notificationsRef.current && typeof Notification !== 'undefined') {
          if (old.status !== 'completed' && next.score.status === 'completed') {
            new Notification('Full time', { body: `${next.score.our_team_name}'s match has finished.` });
          } else if ((next.score.sets || []).length > (old.sets || []).length) {
            const set = next.score.sets.at(-1);
            new Notification(`Set ${set.set} finished`, { body: `${set.us}–${set.them}` });
          }
        }
        setData(next); setUpdated(new Date()); setError(false);
      } catch { setError(true); }
    };
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot,5000);
    return () => clearInterval(interval);
  },[matchId]);

  useEffect(() => {
    const key = `guvc-spectator-${matchId}`;
    let id = sessionStorage.getItem(key);
    if (!id) { id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; sessionStorage.setItem(key,id); }
    let active = true;
    const heartbeat = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/matches/${matchId}/spectators/heartbeat`,{
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session_id:id}),
        });
        if (response.ok && active) setSpectators((await response.json()).spectators);
      } catch { /* Keep showing the last score during temporary connection problems. */ }
    };
    heartbeat();
    const interval = setInterval(heartbeat,10000);
    return () => { active=false; clearInterval(interval); };
  },[matchId]);

  const toggleNotifications = async () => {
    if (typeof Notification === 'undefined') return alert('Notifications are not supported by this browser.');
    if (Notification.permission !== 'granted') setNotifications((await Notification.requestPermission()) === 'granted');
    else setNotifications(value => !value);
  };
  const toggleFullscreen = async () => {
    const next = !scoreOnly; setScoreOnly(next);
    try {
      if (next && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      if (!next && document.fullscreenElement) await document.exitFullscreen?.();
    } catch { /* Score-only mode still works when browser fullscreen is unavailable. */ }
  };
  if (error) return <Shell spectators={spectators}><div style={styles.error}>Match not found.</div></Shell>;
  if (!data) return <Shell spectators={spectators}><div style={styles.muted}>Loading match…</div></Shell>;

  const { score,events=[],lineup,tracker,substitutions=[] } = data;
  const ourName = score.our_team_name;
  const opponentName = score.home_team_name === ourName ? score.away_team_name : score.home_team_name;
  const setsWon = (score.sets||[]).filter(set => set.us > set.them).length;
  const setsLost = (score.sets||[]).filter(set => set.them > set.us).length;
  const servingSide = tracker?.we_are_serving ? 'us' : 'them';
  const servingName = servingSide === 'us' ? ourName : opponentName;
  const server = servingSide === 'us' ? lineup?.on_court?.[0] : null;
  const momentum = getMomentum(events);
  const situation = getMatchSituation(score,ourName,opponentName);
  const timeline = [...events.map(x=>({...x,timelineType:'event'})),...substitutions.map(x=>({...x,timelineType:'substitution'}))]
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const share = async () => {
    const payload={title:`${ourName} vs ${opponentName} live`,text:'Follow the match live on GUVC Analytics.',url:window.location.href};
    if (navigator.share) await navigator.share(payload);
    else { await navigator.clipboard.writeText(window.location.href); alert('Spectator link copied.'); }
  };

  return <div style={{...styles.page,...(scoreOnly?styles.fullscreenPage:{})}}>
    <Header spectators={spectators} share={share} notifications={notifications} toggleNotifications={toggleNotifications} scoreOnly={scoreOnly} toggleFullscreen={toggleFullscreen}/>
    <div style={{...styles.scoreCard,...(scoreOnly?styles.fullscreenCard:{})}}>
      <div style={styles.liveRow}>
        <span style={score.status==='live'?styles.live:styles.final}>{score.status==='live'?'● LIVE':'FINAL'}</span>
        <span style={styles.dim}>Set {score.current_set}</span>
        {tracker && score.status==='live' && <span style={styles.dim}>Rotation {tracker.rotation_number}</span>}
      </div>
      {situation && <div style={styles.situation}>{situation}</div>}
      {tracker && score.status==='live' && <div style={styles.serving}>🏐 {server?`${server.name} serving for `:''}{servingName}{getServingRun(events,servingSide)>1?` · ${getServingRun(events,servingSide)}-point run`:''}</div>}
      <div style={styles.scoreRow}>
        <Team name={ourName} points={score.current_set_our} sets={setsWon} huge={scoreOnly}/>
        <span style={styles.dash}>–</span>
        <Team name={opponentName} points={score.current_set_opponent} sets={setsLost} huge={scoreOnly}/>
      </div>
      {!!score.sets?.length && <div style={styles.sets}>{score.sets.map(set=><div key={set.set} style={styles.set}><small>SET {set.set}</small><b>{set.us} – {set.them}</b></div>)}</div>}
      <div style={styles.refresh}>{updated?`Updated ${updated.toLocaleTimeString('en-GB')}`:'Connecting…'} · refreshes every 5 seconds</div>
    </div>

    <div style={styles.context}>
      <div><Label>Last 10 points</Label><div style={styles.momentum}>{momentum.length?momentum.map((point,index)=><span key={`${point.id}-${index}`} title={point.side==='us'?ourName:opponentName} style={{...styles.dot,background:point.side==='us'?'#F5C800':'#e74c3c'}}/>):<span style={styles.muted}>Waiting for points…</span>}</div></div>
      <div style={styles.legend}><span style={{color:'#F5C800'}}>● {ourName}</span><span style={{color:'#e74c3c'}}>● {opponentName}</span></div>
    </div>

    {!scoreOnly && <>
      <Card title="Match leaders"><div style={styles.leaders}>{getLeaders(events).map(leader=><div key={leader.key} style={styles.leader}><b>{leader.value}</b><span>{leader.name}</span><small>{leader.label}</small></div>)}</div></Card>
      {!!lineup?.on_court?.length && <Card><button style={styles.toggle} onClick={()=>setTechnicalOpen(open=>!open)}><span>Lineup & technical view</span><span>{technicalOpen?'▲':'▼'}</span></button>{technicalOpen&&<Lineup lineup={lineup} tracker={tracker} team={ourName}/>}</Card>}
      <Card title={score.status==='completed'?'Match story':'Live commentary'}>
        {timeline.length?<div style={styles.feed}>{timeline.map((item,index)=><FeedItem key={`${item.timelineType}-${item.id}`} item={item} latest={index===0} ourName={ourName} opponentName={opponentName}/>)}</div>:<p style={styles.empty}>{score.status==='live'?'Waiting for the first rally…':'No events were recorded.'}</p>}
      </Card>
    </>}
  </div>;
}

function Shell({spectators,children}) { return <div style={styles.page}><Header spectators={spectators}/>{children}</div>; }
function Header({spectators,share,notifications,toggleNotifications,scoreOnly,toggleFullscreen}) {
  return <div style={styles.header}><div style={styles.brand}><img src="/guvc-logo.png" alt="GUVC"/><span>GUVC Live</span></div><div style={styles.actions}>
    {spectators!==null&&<span style={styles.pill}>👥 {spectators}</span>}
    {toggleNotifications&&<button style={styles.darkButton} onClick={toggleNotifications}>{notifications?'🔔 On':'🔕 Alerts'}</button>}
    {toggleFullscreen&&<button style={styles.darkButton} onClick={toggleFullscreen}>{scoreOnly?'Exit score':'⛶ Score'}</button>}
    {share&&<button style={styles.share} onClick={share}>Share</button>}
  </div></div>;
}
function Team({name,points,sets,huge}) { return <div style={styles.team}><div style={styles.teamName}>{name}</div><div style={{...styles.points,...(huge?styles.huge:{})}}>{points}</div><small>{sets} set{sets!==1?'s':''}</small></div>; }
function Card({title,children}) { return <div style={styles.card}>{title&&<Label>{title}</Label>}{children}</div>; }
function Label({children}) { return <div style={styles.label}>{children}</div>; }

function Lineup({lineup,tracker,team}) {
  const slot=index => {
    const player=lineup.on_court[index]; const server=index===0&&tracker?.we_are_serving;
    return <div key={index} style={{...styles.courtSlot,borderTop:`4px solid ${POSITION_COLORS[player?.position]||'#444'}`,...(server?styles.serverSlot:{})}}>
      <span style={styles.position}>P{index+1}</span>{server&&<small style={styles.serverTag}>SERVING</small>}
      {player?<><b style={styles.jersey}>{player.jersey_number?`#${player.jersey_number}`:''}</b><strong>{player.name}</strong><small style={styles.dim}>{player.position||''}</small></>:<span>—</span>}
    </div>;
  };
  return <div style={styles.technical}><Label>Current lineup — {team}</Label><div style={styles.court}><div style={styles.net}>NET</div><div style={styles.courtRow}>{[3,2,1].map(slot)}</div><div style={styles.courtLine}/><div style={styles.courtRow}>{[4,5,0].map(slot)}</div><div style={styles.baseline}>BASELINE</div></div>
    {!!lineup.bench?.length&&<><Label>Bench</Label><div style={styles.bench}>{lineup.bench.map(player=><div key={player.id} style={styles.benchPlayer}><b>{player.jersey_number?`#${player.jersey_number}`:'—'}</b><span>{player.name}</span><small>{player.position||''}</small></div>)}</div></>}
  </div>;
}
function FeedItem({item,latest,ourName,opponentName}) {
  const sub=item.timelineType==='substitution'; const meta=sub?['⇄','#F5C800']:(META[item.event_type]||['•','#888']);
  const text=sub?`${item.player_in_name} replaces ${item.player_out_name}.`:describeEvent(item,ourName,opponentName);
  const time=new Date(item.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return <div style={{...styles.feedItem,...(latest?styles.latest:{})}}><span style={styles.emoji}>{meta[0]}</span><div style={styles.feedText}><strong style={{color:meta[1]}}>{text}</strong><small>Set {item.set_number}{sub?` · Rotation ${item.rotation_number}`:''}</small></div><time>{time}</time></div>;
}

const styles={
  page:{minHeight:'100vh',background:'#0d0d0d',color:'#f5f5f5',display:'flex',flexDirection:'column',alignItems:'center',padding:'0 16px 32px',gap:14},
  fullscreenPage:{justifyContent:'center',paddingBottom:16},header:{width:'100%',maxWidth:900,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',gap:12,flexWrap:'wrap'},
  brand:{display:'flex',alignItems:'center',gap:9,color:'#F5C800',fontWeight:900,letterSpacing:'.04em'},actions:{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'},
  pill:{fontSize:12,color:'#bbb',background:'#1a1a1a',border:'1px solid #333',borderRadius:999,padding:'7px 10px'},darkButton:{padding:'7px 10px',color:'#ddd',background:'#1a1a1a',border:'1px solid #3a3a3a',borderRadius:999,fontSize:11,fontWeight:700,cursor:'pointer'},share:{padding:'7px 13px',color:'#111',background:'#F5C800',border:0,borderRadius:999,fontSize:11,fontWeight:900,cursor:'pointer'},
  scoreCard:{background:'linear-gradient(160deg,#1d1d1d,#151515)',border:'1px solid #333',borderRadius:18,padding:'26px 20px',width:'100%',maxWidth:900,textAlign:'center',boxShadow:'0 12px 40px #0006'},fullscreenCard:{maxWidth:1200,padding:'40px 30px'},
  liveRow:{display:'flex',justifyContent:'center',gap:12,alignItems:'center',marginBottom:14},live:{color:'#ff6b6b',fontWeight:900},final:{color:'#F5C800',fontWeight:900},dim:{color:'#888'},situation:{color:'#111',background:'#F5C800',padding:'7px 14px',display:'inline-block',borderRadius:999,fontWeight:900,marginBottom:12,textTransform:'uppercase',fontSize:12},serving:{display:'table',margin:'0 auto 16px',padding:'8px 14px',color:'#9affbd',background:'#123520',border:'1px solid #286643',borderRadius:999,fontSize:12,fontWeight:800},
  scoreRow:{display:'flex',alignItems:'center',justifyContent:'center',gap:16,marginBottom:20},team:{flex:1,minWidth:0},teamName:{fontSize:13,color:'#ddd',fontWeight:800,textTransform:'uppercase',overflowWrap:'anywhere'},points:{fontSize:72,fontWeight:900,color:'#F5C800',lineHeight:1,margin:'7px 0'},huge:{fontSize:'clamp(88px,18vw,190px)'},dash:{fontSize:32,color:'#444'},sets:{display:'flex',justifyContent:'center',gap:8,flexWrap:'wrap',marginBottom:12},set:{background:'#242424',border:'1px solid #333',borderRadius:8,padding:'5px 11px',display:'flex',flexDirection:'column',gap:2},refresh:{fontSize:10,color:'#666'},
  context:{width:'100%',maxWidth:900,background:'#171717',border:'1px solid #2d2d2d',borderRadius:14,padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:14,flexWrap:'wrap'},label:{color:'#F5C800',fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10},momentum:{display:'flex',gap:6,alignItems:'center'},dot:{width:16,height:16,borderRadius:'50%',border:'2px solid #ffffff20'},legend:{display:'flex',gap:12,fontSize:10,flexWrap:'wrap'},
  card:{background:'#181818',border:'1px solid #2d2d2d',borderRadius:16,padding:18,width:'100%',maxWidth:900},leaders:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8},leader:{background:'#202020',border:'1px solid #303030',borderRadius:10,padding:12,display:'grid',gridTemplateColumns:'auto 1fr',columnGap:9,alignItems:'center'},toggle:{width:'100%',color:'#F5C800',background:'transparent',border:0,display:'flex',justifyContent:'space-between',padding:0,fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.08em',cursor:'pointer'},technical:{marginTop:16},
  court:{background:'#17172d',borderRadius:10,padding:12,marginBottom:14,border:'1px solid #2a2a4a'},net:{textAlign:'center',fontSize:10,color:'#F5C800',fontWeight:800,letterSpacing:'.15em',marginBottom:8},baseline:{textAlign:'center',fontSize:9,color:'#555',marginTop:8},courtRow:{display:'flex',gap:6},courtLine:{height:2,background:'#303050',margin:'6px 0'},courtSlot:{flex:1,background:'#1e1e38',borderRadius:8,padding:'9px 4px',minHeight:75,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',position:'relative',border:'1px solid #2a2a4a'},serverSlot:{boxShadow:'0 0 0 2px #2ecc71 inset'},position:{position:'absolute',top:3,left:4,fontSize:9,color:'#666'},serverTag:{color:'#2ecc71',fontWeight:800},jersey:{color:'#F5C800'},bench:{display:'flex',gap:6,flexWrap:'wrap'},benchPlayer:{background:'#111',border:'1px solid #292929',borderRadius:7,padding:'7px 9px',textAlign:'center',minWidth:64,display:'flex',flexDirection:'column',fontSize:10},
  feed:{display:'flex',flexDirection:'column',gap:5},feedItem:{display:'flex',alignItems:'center',gap:9,padding:10,borderRadius:9,background:'#202020',border:'1px solid transparent'},latest:{background:'#242300',borderColor:'#4a4700'},emoji:{fontSize:17,width:24,textAlign:'center'},feedText:{flex:1,minWidth:0,display:'flex',flexDirection:'column',fontSize:13},empty:{color:'#666',textAlign:'center',padding:16},muted:{color:'#777'},error:{color:'#ff6b6b'},
};
