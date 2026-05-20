import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Dimensions, Image, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

// --- CONFIGURAZIONE ---
const TMDB_API_KEY = "d3667aaae610489566261eb4cff9f348";
const BASE_IMAGE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";
const { width: screenWidth, height: screenHeight } = Dimensions.get('window'); 

// VERSIONE 27 - REDENZIONE: UI PREMIUM TRASPARENTE, FIX CAROSELLO E FIX ERRORE DI RETE
const APP_VERSION_CODE = 27; 

const GITHUB_RAW_LINK = "https://raw.githubusercontent.com/flaviodetroia02-blip/NetChill-app/main/link.txt";
const GITHUB_UPDATE_LINK = "https://raw.githubusercontent.com/flaviodetroia02-blip/NetChill-app/main/update.json";

const GENRES = [
  { id: null, name: 'Tutti' },
  { id: 28, name: 'Azione' },
  { id: 35, name: 'Commedia' },
  { id: 27, name: 'Horror' },
  { id: 10749, name: 'Romantico' },
  { id: 878, name: 'Fantascienza' },
  { id: 16, name: 'Animazione' },
];

const AVATARS = ['😎', '👽', '👾', '👻', '🤖', '🤠', '🦊', '🐱'];

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [sections, setSections] = useState({ trending: [], pop: [], top: [], searchResults: [] });
  const [continueWatching, setContinueWatching] = useState([]); 
  const [myList, setMyList] = useState([]); 
  const [recommendations, setRecommendations] = useState([]);
  
  const [heroItems, setHeroItems] = useState([]);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home'); 
  const [mediaType, setMediaType] = useState('movie'); 
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [targetUrl, setTargetUrl] = useState('');
  const [currentMovie, setCurrentMovie] = useState(null); 
  const [isWebViewLoading, setIsWebViewLoading] = useState(false);

  const [showTrailer, setShowTrailer] = useState(false);
  const [isTrailerMuted, setIsTrailerMuted] = useState(true); 
  const scrollY = useRef(0);
  const trailerTimeout = useRef(null);

  // 🔴 DOMINIO FALLBACK BLINDATO PER EVITARE L'ERRORE "ERR_NAME_NOT_RESOLVED"
  const [streamingDomain, setStreamingDomain] = useState('https://cineblog001.bar');

  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const [updateData, setUpdateData] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);

  const webViewRef = useRef(null);
  const trailerWebViewRef = useRef(null); 
  const currentMovieRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => { historyRef.current = continueWatching; }, [continueWatching]);
  useEffect(() => { currentMovieRef.current = currentMovie; }, [currentMovie]);

  const historyIds = continueWatching.map(x => x.id).join(',');
  const listIds = myList.map(x => x.id).join(',');

  const startTrailerTimer = () => {
    clearTimeout(trailerTimeout.current);
    trailerTimeout.current = setTimeout(() => {
      if (scrollY.current < 100) { setShowTrailer(true); }
    }, 3000); 
  };

  useEffect(() => {
    if (heroItems.length > 0 && trailerKey) {
      setShowTrailer(false);
      setIsTrailerMuted(true); 
      startTrailerTimer();
    }
    return () => clearTimeout(trailerTimeout.current);
  }, [activeHeroIndex, trailerKey]); 

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.current = y;
    if (y > 100 && showTrailer) {
      setShowTrailer(false); setIsTrailerMuted(true); 
    } else if (y <= 100 && !showTrailer && trailerKey) {
      startTrailerTimer();
    }
  };

  const handleHeroScroll = (event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = Math.round(event.nativeEvent.contentOffset.x / slideSize);
    if (index !== activeHeroIndex) {
      setActiveHeroIndex(index);
      setShowTrailer(false); 
      setTrailerKey(null); 
      if (heroItems[index]) {
        fetchTrailer(heroItems[index].id, mediaType); 
      }
    }
  };

  const toggleTrailerAudio = () => {
    const newMutedState = !isTrailerMuted;
    setIsTrailerMuted(newMutedState);
    if (trailerWebViewRef.current) {
      trailerWebViewRef.current.injectJavaScript(`
        window.isAppMuted = ${newMutedState};
        var v = document.querySelector('video');
        if(v) { v.muted = ${newMutedState}; }
        true;
      `);
    }
  };

  // Ottimizzazione Raccomandazioni per non far esplodere la UI
  useEffect(() => {
    const buildAdvancedRecommendations = async () => {
      if (!activeProfile) return;
      try {
        const historyItems = continueWatching.filter(i => i.media_type === mediaType || (!i.media_type && mediaType === 'movie'));
        const listItems = myList.filter(i => i.media_type === mediaType || (!i.media_type && mediaType === 'movie'));
        const seedItems = [...historyItems.slice(0, 2), ...listItems.slice(0, 1)];

        if (seedItems.length === 0) {
          const fallback = await fetch(`https://api.themoviedb.org/3/discover/${mediaType}?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc`).then(r => r.json());
          setRecommendations(fallback.results ? fallback.results.slice(0, 10) : []);
          return;
        }

        const allRecs = [];
        for (const item of seedItems) {
          const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${item.id}/recommendations?api_key=${TMDB_API_KEY}&language=it-IT`).then(r => r.json());
          if (res.results) allRecs.push(...res.results);
        }

        const recScores = {}; const recData = {};
        allRecs.forEach(rec => {
          if (!recScores[rec.id]) { recScores[rec.id] = 0; recData[rec.id] = rec; }
          recScores[rec.id] += 1 + (rec.vote_average / 10); 
        });

        const knownIds = new Set([...continueWatching.map(i => i.id), ...myList.map(i => i.id)]);
        const finalRecs = Object.values(recData)
          .filter(rec => !knownIds.has(rec.id))
          .sort((a, b) => recScores[b.id] - recScores[a.id])
          .slice(0, 12); 

        if (finalRecs.length < 3) {
           const topGenre = seedItems[0].genre_ids?.[0];
           const fallback = await fetch(`https://api.themoviedb.org/3/discover/${mediaType}?api_key=${TMDB_API_KEY}&language=it-IT&with_genres=${topGenre}`).then(r => r.json());
           setRecommendations(fallback.results ? fallback.results.filter(m => !knownIds.has(m.id)).slice(0, 10) : []);
        } else {
           setRecommendations(finalRecs);
        }
      } catch(e) { setRecommendations([]); }
    };
    buildAdvancedRecommendations();
  }, [historyIds, listIds, activeProfile, mediaType]);

  useEffect(() => {
    const backAction = () => {
      if (targetUrl) { if (webViewRef.current) webViewRef.current.goBack(); return true; }
      return false; 
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [targetUrl]);

  const splashOpacity = useRef(new Animated.Value(1)).current; 
  const globalZoom = useRef(new Animated.Value(1)).current; 
  const glowAnim = useRef(new Animated.Value(0)).current; 
  const LETTERS = "NETCHILL".split("");
  const letterAnims = useRef(LETTERS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    startCinematicSplash();
    fetchHomeData();
    loadInitialConfig();
    fetchDomainFromGitHub(); 
    checkForUpdates();
  }, []);

  useEffect(() => { fetchHomeData(selectedGenre); }, [mediaType]);

  const checkForUpdates = async () => {
    try {
      const response = await fetch(GITHUB_UPDATE_LINK + '?t=' + new Date().getTime());
      if (response.ok) {
        const data = await response.json();
        if (data.versionCode > APP_VERSION_CODE) { setUpdateData(data); }
      }
    } catch (e) {}
  };

  const fetchTrailer = async (id, type) => {
    try {
      const fetchType = type === 'tv' ? 'tv' : 'movie';
      let res = await fetch(`https://api.themoviedb.org/3/${fetchType}/${id}/videos?api_key=${TMDB_API_KEY}&language=it-IT`).then(r => r.json());
      if (!res.results || res.results.length === 0) {
        res = await fetch(`https://api.themoviedb.org/3/${fetchType}/${id}/videos?api_key=${TMDB_API_KEY}&language=en-US`).then(r => r.json());
      }
      const trailer = res.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') || res.results?.find(v => v.site === 'YouTube') || res.results?.[0];
      if (trailer) { setTrailerKey(trailer.key); } else { setTrailerKey(null); }
    } catch (e) { setTrailerKey(null); }
  };

  const fetchDomainFromGitHub = async () => {
    try {
      const response = await fetch(GITHUB_RAW_LINK + '?t=' + new Date().getTime());
      if (response.ok) {
        let text = await response.text();
        text = text.trim(); 
        if (text.startsWith('http')) {
          if (text.endsWith('/')) text = text.slice(0, -1);
          setStreamingDomain(text);
        }
      }
    } catch (e) {}
  };

  const loadInitialConfig = async () => {
    try {
      const savedProfiles = await AsyncStorage.getItem('@profiles');
      if (savedProfiles) { setProfiles(JSON.parse(savedProfiles)); } else {
        const defaultProfile = [{ id: '1', name: 'Ospite', avatar: '😎' }];
        setProfiles(defaultProfile);
        await AsyncStorage.setItem('@profiles', JSON.stringify(defaultProfile));
      }
    } catch (e) {}
  };

  useEffect(() => { if (activeProfile) loadUserData(activeProfile.id); }, [activeProfile]);

  const loadUserData = async (profileId) => {
    try {
      const savedHistory = await AsyncStorage.getItem(`@continue_watching_${profileId}`);
      if (savedHistory) setContinueWatching(JSON.parse(savedHistory)); else setContinueWatching([]); 
      const savedList = await AsyncStorage.getItem(`@my_list_${profileId}`);
      if (savedList) setMyList(JSON.parse(savedList)); else setMyList([]);
    } catch (e) {}
  };

  const createProfile = async () => {
    if (newProfileName.trim() === '' || profiles.length >= 4) return;
    const newProfile = { id: Date.now().toString(), name: newProfileName.trim(), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] };
    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    await AsyncStorage.setItem('@profiles', JSON.stringify(updatedProfiles));
    setNewProfileName(''); setIsCreatingProfile(false);
  };

  const deleteProfile = async (id) => {
    if (profiles.length <= 1) return; 
    const updatedProfiles = profiles.filter(p => p.id !== id);
    setProfiles(updatedProfiles);
    await AsyncStorage.setItem('@profiles', JSON.stringify(updatedProfiles));
  };

  const toggleMyList = async (item) => {
    if (!activeProfile) return;
    try {
      let currentList = [...myList];
      const exists = currentList.find(x => x.id === item.id);
      if (exists) { currentList = currentList.filter(x => x.id !== item.id); } else {
        currentList.unshift({ id: item.id, title: item.title || item.name, poster_path: item.poster_path, genre_ids: item.genre_ids, media_type: mediaType });
      }
      setMyList(currentList);
      await AsyncStorage.setItem(`@my_list_${activeProfile.id}`, JSON.stringify(currentList));
    } catch (e) {}
  };

  const startPlaying = async (item, isResume = false) => {
    if (!activeProfile) return;
    try {
      let currentHistory = [...continueWatching];
      const existing = currentHistory.find(x => x.id === item.id);
      const progressToSave = existing ? existing.progress : 0;
      const durationToSave = existing ? existing.duration : 0;
      const lastUrlToSave = (existing && isResume) ? existing.lastUrl : null; 
      const episodeInfoToSave = existing ? existing.episodeInfo : null;

      currentHistory = currentHistory.filter(x => x.id !== item.id);
      const newItem = {
        id: item.id, title: item.title || item.name, poster_path: item.poster_path,
        progress: progressToSave, duration: durationToSave, lastUrl: lastUrlToSave, episodeInfo: episodeInfoToSave,
        genre_ids: item.genre_ids || existing?.genre_ids, media_type: mediaType 
      };
      
      const updatedList = [newItem, ...currentHistory].slice(0, 15); 
      setContinueWatching(updatedList);
      await AsyncStorage.setItem(`@continue_watching_${activeProfile.id}`, JSON.stringify(updatedList));
      setCurrentMovie(newItem);

      // Assicuriamoci che il dominio sia solido per evitare ERR_NAME_NOT_RESOLVED
      const safeDomain = streamingDomain && streamingDomain.startsWith('http') ? streamingDomain : 'https://cineblog001.bar';
      const cleanTitle = (item.title || item.name).replace(/[^a-zA-Z0-9 ]/g, " ").trim();
      const searchUrl = `${safeDomain}/index.php?do=search&subaction=search&story=${encodeURIComponent(cleanTitle)}`;
      const finalUrl = lastUrlToSave ? lastUrlToSave : searchUrl;
      
      setTargetUrl(finalUrl);
      setIsWebViewLoading(true);
      setTimeout(() => { setIsWebViewLoading(false); }, 3000); 

    } catch (e) {}
  };

  const fetchHomeData = async (genreId = null) => {
    setLoading(true);
    try {
      const gParam = genreId ? `&with_genres=${genreId}` : '';
      
      const trendingUrl = genreId 
        ? `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc${gParam}`
        : `https://api.themoviedb.org/3/trending/${mediaType}/week?api_key=${TMDB_API_KEY}&language=it-IT`;
        
      const popUrl = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc${gParam}&page=2`;
      const topUrl = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=vote_count.desc${gParam}`;

      const [trending, pop, top] = await Promise.all([
        fetch(trendingUrl).then(res => res.json()),
        fetch(popUrl).then(res => res.json()),
        fetch(topUrl).then(res => res.json()),
      ]);

      if (trending.results && trending.results.length > 0) {
        const top7 = trending.results.slice(0, 7);
        setHeroItems(top7);
        setActiveHeroIndex(0);
        if (top7[0]) fetchTrailer(top7[0].id, mediaType); 
        setSections({ trending: trending.results.slice(7, 20), pop: pop.results || [], top: top.results || [], searchResults: [] });
      } else {
        setHeroItems([]);
        setSections({ trending: [], pop: [], top: [], searchResults: [] });
      }
      setLoading(false);
    } catch (e) { setLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true); setView('search');
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=it-IT&query=${encodeURIComponent(searchQuery)}`).then(r => r.json());
      setSections(prev => ({ ...prev, searchResults: res.results }));
    } catch (e) {}
    setLoading(false);
  };

  const startCinematicSplash = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(require('../assets/images/tudum.mp3'));
      await sound.playAsync();
    } catch (e) {}
    const letterAnimations = letterAnims.map(anim => Animated.spring(anim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: false }));
    Animated.sequence([
      Animated.stagger(120, letterAnimations), 
      Animated.timing(glowAnim, { toValue: 1, duration: 500, useNativeDriver: false }), 
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(globalZoom, { toValue: 15, duration: 700, useNativeDriver: false }),
        Animated.timing(splashOpacity, { toValue: 0, duration: 600, useNativeDriver: false }) 
      ])
    ]).start(() => setShowSplash(false));
  };

  const ytInject = `
    (function() {
      window.isAppMuted = true;
      const css = document.createElement('style');
      css.innerHTML = 'body * { visibility: hidden !important; background: transparent !important; } video, video * { visibility: visible !important; } video { position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; object-fit: cover !important; z-index: 2147483647 !important; background: #000 !important; }';
      document.head.appendChild(css);
      
      setInterval(() => {
        document.querySelectorAll('button').forEach(btn => {
          if ((btn.textContent||'').toLowerCase().includes('accetta')) btn.click();
        });
        
        var v = document.querySelector('video');
        if (v) {
          v.muted = window.isAppMuted; 
          if (v.paused) v.play().catch(e=>{});
        }
        var playBtn = document.querySelector('.ytp-large-play-button');
        if (playBtn && playBtn.style.display !== 'none') playBtn.click();
      }, 500);
    })();
    true;
  `;

  const dynamicJS = `
    (function() {
      const tvStyle = document.createElement('style');
      tvStyle.innerHTML = \`
        html, body { background-color: #000000 !important; color: #ffffff !important; margin: 0 !important; padding: 0 !important; overflow-x: hidden !important; }
        header, footer, #sidebar, .sidebar, .widget-area, #comments, .menu, .logo, .ads, .top-header, .head, #header, .mobile-header, .social-share, .tags, .breadcrumb, form, center, .speedbar, .berrors { 
          display: none !important; opacity: 0 !important; visibility: hidden !important; width: 0 !important; height: 0 !important; 
        }
        #dle-content, main, .content, article { 
          width: 100vw !important; max-width: 100% !important; padding: 20px !important; margin: 0 auto !important; box-sizing: border-box !important; display: flex !important; flex-direction: column !important; align-items: center !important;
        }
        .short { margin-bottom: 40px !important; text-align: center !important; max-width: 600px !important; }
        .short img { transform: scale(1.1) !important; border-radius: 12px !important; margin-bottom: 15px !important; }
        .story-heading { font-size: 26px !important; margin-top: 20px !important; font-family: sans-serif !important; }
        .story-heading a { color: #ffffff !important; text-decoration: none !important; }
        iframe#iFrameResizer0, iframe, .video-container {
          width: 100% !important; max-width: 900px !important; aspect-ratio: 16 / 9 !important; height: auto !important; border-radius: 12px !important; border: 2px solid #222 !important; margin-top: 15px !important; box-shadow: 0px 10px 30px rgba(0,0,0,0.8) !important;
        }
      \`;
      document.documentElement.appendChild(tvStyle); 

      window.open = function() { return null; }; 

      window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'TIME_UPDATE') {
          try { window.ReactNativeWebView.postMessage(JSON.stringify(e.data)); } catch(err){}
        }
      });

      setInterval(() => {
        document.querySelectorAll('div').forEach(el => {
          const style = window.getComputedStyle(el);
          if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex) > 50) {
            if (!el.contains(document.querySelector('iframe')) && !el.contains(document.querySelector('video'))) el.remove();
          }
        });

        document.querySelectorAll('a, p, span, b, strong').forEach(el => {
          const txt = (el.textContent || '').toLowerCase();
          if (txt.includes('cliccaci per') || txt.includes('scarica download') || txt.includes('hd/4k gratis') || txt.includes('l\\'indirizzo ufficiale') || txt.includes('cerca su cb01') || txt.includes('film streaming') || txt.includes('risultati di ricerca')) {
            el.style.display = 'none';
          }
        });
      }, 500);

      let initialSavedTime = parseFloat("${currentMovie?.progress || 0}");
      let currentUrl = location.href; let hasSeeked = (initialSavedTime < 5); let lastSaved = 0;

      function attachToVideo(v) {
        if (!v || v.dataset.hooked) return;
        v.dataset.hooked = "true"; 
        const trySeek = () => {
          if (!hasSeeked && v.readyState >= 1) {
            if (Math.abs(v.currentTime - initialSavedTime) > 5) { 
              v.currentTime = initialSavedTime; 
            } else { 
              hasSeeked = true; 
            }
          }
        };
        v.addEventListener('loadedmetadata', trySeek);
        v.addEventListener('playing', trySeek);
        
        setInterval(() => {
          if (!hasSeeked) trySeek();
          if (hasSeeked && v.currentTime > 0 && !v.paused) {
            if (Math.abs(v.currentTime - lastSaved) > 5) {
              lastSaved = v.currentTime;
              let payload = { type: 'TIME_UPDATE', time: v.currentTime, duration: v.duration || 0, url: location.href, pageTitle: document.title };
              if (window !== window.parent) {
                window.parent.postMessage(payload, '*');
              } else {
                try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch(e) {}
              }
            }
          }
        }, 1000);
      }
      setInterval(() => { document.querySelectorAll('video').forEach(attachToVideo); }, 1000);
    })();
    true;
  `;

  const filteredHistory = continueWatching.filter(x => (mediaType === 'movie' ? (!x.media_type || x.media_type === 'movie') : x.media_type === 'tv'));
  const filteredMyList = myList.filter(x => (mediaType === 'movie' ? (!x.media_type || x.media_type === 'movie') : x.media_type === 'tv'));

  if (showSplash) {
    const glowColor = glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(229, 9, 20, 0)', 'rgba(229, 9, 20, 0.9)'] });
    return (
      <Animated.View style={[styles.splash, { opacity: splashOpacity }]}>
        <StatusBar hidden />
        <Animated.View style={{ flexDirection: 'row', transform: [{ scale: globalZoom }] }}>
          {LETTERS.map((letter, index) => (
            <Animated.Text key={index} style={[styles.splashLetter, { opacity: letterAnims[index], transform: [{ scale: letterAnims[index] }], textShadowColor: glowColor, textShadowRadius: 15 }]}>
              {letter}
            </Animated.Text>
          ))}
        </Animated.View>
      </Animated.View>
    );
  }

  if (!activeProfile) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" />
        <Text style={[styles.logo, { fontSize: 30, position: 'absolute', top: 50 }]}>NETCHILL</Text>
        {isCreatingProfile ? (
          <View style={{ width: '80%', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 24, marginBottom: 20 }}>Nuovo Profilo</Text>
            <TextInput style={[styles.searchBar, { width: '100%', marginBottom: 20, padding: 15, fontSize: 16 }]} placeholder="Nome Profilo..." placeholderTextColor="#666" value={newProfileName} onChangeText={setNewProfileName} autoFocus />
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity style={[styles.playBtn, { backgroundColor: '#333', marginRight: 10 }]} onPress={() => setIsCreatingProfile(false)}><Text style={{ color: 'white', fontWeight: 'bold' }}>ANNULLA</Text></TouchableOpacity>
              <TouchableOpacity style={styles.playBtn} onPress={createProfile}><Text style={styles.playBtnText}>SALVA</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 24, marginBottom: 30 }}>Chi sta guardando?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 400 }}>
              {profiles.map(p => (
                <TouchableOpacity key={p.id} style={{ alignItems: 'center', margin: 15 }} onPress={() => setActiveProfile(p)} onLongPress={() => deleteProfile(p.id)} hasTVPreferredFocus={true}>
                  <View style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontSize: 40 }}>{p.avatar}</Text>
                  </View>
                  <Text style={{ color: 'gray', fontSize: 16, fontWeight: 'bold' }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
              {profiles.length < 4 && (
                <TouchableOpacity style={{ alignItems: 'center', margin: 15 }} onPress={() => setIsCreatingProfile(true)}>
                  <View style={{ width: 80, height: 80, borderRadius: 10, borderWidth: 2, borderColor: '#333', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontSize: 40, color: '#666' }}>+</Text>
                  </View>
                  <Text style={{ color: '#666', fontSize: 16, fontWeight: 'bold' }}>Aggiungi</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
      {updateData && (
        <Modal transparent={true} animationType="fade" visible={!!updateData}>
          <View style={styles.updateModalContainer}>
            <View style={styles.updateBox}>
              <Text style={[styles.logo, { fontSize: 32, marginBottom: 10 }]}>NETCHILL</Text>
              <Text style={styles.updateTitle}>Nuovo Aggiornamento</Text>
              <Text style={styles.updateDesc}>{updateData.message || "È disponibile una nuova versione."}</Text>
              <TouchableOpacity style={styles.updateBtn} onPress={() => Linking.openURL(updateData.url)} hasTVPreferredFocus={true}>
                <Text style={styles.updateBtnText}>SCARICA ORA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setUpdateData(null)}>
                <Text style={{ color: '#666', fontWeight: 'bold' }}>Più tardi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* 🔴 HEADER TRASPARENTE FLUTTUANTE (Effetto Premium) 🔴 */}
      {!targetUrl && (
        <View style={styles.floatingHeader}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 15 }}>
            <TouchableOpacity onPress={() => {setView('home'); setSelectedGenre(null); fetchHomeData();}}>
              <Text style={styles.logo}>NETCHILL</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput style={[styles.searchBar, { width: 130, marginRight: 15 }]} placeholder="Cerca..." placeholderTextColor="#ccc" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={handleSearch} />
              <TouchableOpacity onPress={() => setActiveProfile(null)} style={{ width: 35, height: 35, borderRadius: 5, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>{activeProfile.avatar}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mediaToggleContainer}>
            <TouchableOpacity style={[styles.mediaToggleBtn, mediaType === 'movie' && styles.mediaToggleBtnActive]} onPress={() => { setMediaType('movie'); setSelectedGenre(null); }}>
              <Text style={[styles.mediaToggleText, mediaType === 'movie' && styles.mediaToggleTextActive]}>🎬 FILM</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mediaToggleBtn, mediaType === 'tv' && styles.mediaToggleBtnActive]} onPress={() => { setMediaType('tv'); setSelectedGenre(null); }}>
              <Text style={[styles.mediaToggleText, mediaType === 'tv' && styles.mediaToggleTextActive]}>📺 SERIE</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.catBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {GENRES.map(g => (
                <TouchableOpacity key={g.id} style={[styles.catTab, selectedGenre === g.id && styles.catActive]} onPress={() => { setSelectedGenre(g.id); fetchHomeData(g.id); }}>
                  <Text style={[styles.catText, selectedGenre === g.id && {color: 'white'}]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {!targetUrl ? (
        <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
          {view === 'home' ? (
            <>
              {/* 🔴 CAROSELLO GIGANTE (60% dell'altezza schermo) 🔴 */}
              {heroItems.length > 0 && !loading && (
                <View style={styles.heroContainer}>
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={handleHeroScroll}>
                    {heroItems.map((item, index) => (
                      <View key={item.id} style={{ width: screenWidth, height: screenHeight * 0.65, backgroundColor: '#000' }}>
                        
                        <Image source={{ uri: BACKDROP_URL + item.backdrop_path }} style={[StyleSheet.absoluteFill, { opacity: showTrailer && activeHeroIndex === index ? 0 : 1 }]} />
                        
                        {trailerKey && showTrailer && activeHeroIndex === index && (
                          <View style={StyleSheet.absoluteFill} pointerEvents="none">
                            <WebView
                              ref={trailerWebViewRef}
                              style={{ flex: 1, backgroundColor: 'black' }}
                              javaScriptEnabled={true} domStorageEnabled={true} allowsInlineMediaPlayback={true} mediaPlaybackRequiresUserAction={false}
                              source={{ uri: `https://m.youtube.com/watch?v=${trailerKey}` }}
                              injectedJavaScript={ytInject} injectedJavaScriptForMainFrameOnly={false}
                            />
                          </View>
                        )}

                        {/* Sfumatura nera in basso per fondere il carosello con i film sotto */}
                        <View style={styles.heroGradient}>
                          <Text style={styles.heroTitle}>{item.title || item.name}</Text>
                          <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <TouchableOpacity style={styles.playBtn} onPress={() => startPlaying(item)}>
                              <Text style={styles.playBtnText}>▶ RIPRODUCI</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.heroAddBtn} onPress={() => toggleMyList(item)}>
                              <Text style={styles.heroAddBtnText}>{myList.find(x => x.id === item.id) ? '✓' : '+'}</Text>
                            </TouchableOpacity>
                          </View>
                          
                          {showTrailer && activeHeroIndex === index && (
                            <TouchableOpacity style={styles.muteBtn} onPress={toggleTrailerAudio}>
                              <Text style={{fontSize: 16}}>{isTrailerMuted ? '🔇' : '🔊'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                  
                  <View style={styles.dotsContainer}>
                    {heroItems.map((_, i) => (
                      <View key={i} style={[styles.dot, activeHeroIndex === i && styles.activeDot]} />
                    ))}
                  </View>
                </View>
              )}
              
              {loading ? <ActivityIndicator color="#E50914" style={{marginTop: 150}} /> : (
                <View style={styles.content}>
                  {filteredHistory.length > 0 && !selectedGenre && (
                    <Row title={`Continua a guardare, ${activeProfile.name}`} data={filteredHistory} onPlay={(i) => startPlaying(i, true)} isHistory myList={myList} onToggleList={toggleMyList} />
                  )}
                  {recommendations.length > 0 && !selectedGenre && (
                    <Row title={`Scelti per te, ${activeProfile.name}`} data={recommendations} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  )}
                  {filteredMyList.length > 0 && !selectedGenre && (
                    <Row title="La mia Lista" data={filteredMyList} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  )}
                  {sections.trending && sections.trending.length > 0 && (
                     <Row title={selectedGenre ? "I migliori della categoria" : "Tendenze della settimana"} data={sections.trending} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  )}
                  {sections.pop && sections.pop.length > 0 && (
                     <Row title={mediaType === 'movie' ? "Film Consigliati" : "Serie TV Consigliate"} data={sections.pop} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  )}
                  {sections.top && sections.top.length > 0 && (
                     <Row title="I Più Votati" data={sections.top} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  )}
                </View>
              )}
            </>
          ) : (
            <View style={styles.searchGrid}>
              <View style={{height: 150}} /> {/* Spazio per l'header trasparente */}
              <Text style={styles.rowTitle}>Risultati per: {searchQuery}</Text>
              <View style={styles.grid}>
                {sections.searchResults.map(m => (
                  <MovieCard key={m.id} item={m} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <SafeAreaView style={{flex: 1, backgroundColor: '#000'}}>
          <View style={styles.browserBar}>
            <TouchableOpacity onPress={() => { if (webViewRef.current) webViewRef.current.goBack(); }} hasTVPreferredFocus={true}>
              <Text style={styles.barLink}>← INDIETRO</Text>
            </TouchableOpacity>
            <Text style={styles.barTitle}>SHIELD ATTIVO 🛡️</Text>
            <TouchableOpacity onPress={() => { setTargetUrl(''); setCurrentMovie(null); }}>
              <Text style={styles.barLink}>CHIUDI</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {isWebViewLoading && (
              <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
                <ActivityIndicator size="large" color="#E50914" />
                <Text style={{ color: '#E50914', marginTop: 15, fontWeight: 'bold', fontSize: 16 }}>Agganciamento Server...</Text>
              </View>
            )}

            <WebView 
              ref={webViewRef}
              source={{ uri: targetUrl, headers: { 'Referer': streamingDomain } }}
              userAgent="Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
              sharedCookiesEnabled={true} thirdPartyCookiesEnabled={true} 
              injectedJavaScript={dynamicJS} injectedJavaScriptForMainFrameOnly={false} 
              style={{ flex: 1, backgroundColor: '#000' }} allowsInlineMediaPlayback={true} allowsFullscreenVideo={true} mediaPlaybackRequiresUserAction={false}
              onLoadStart={() => setIsWebViewLoading(true)}
              onMessage={async (e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'TIME_UPDATE' && currentMovieRef.current && activeProfile) {
                    let currentList = [...historyRef.current];
                    const idx = currentList.findIndex(x => x.id === currentMovieRef.current.id);
                    if (idx > -1) {
                      currentList[idx].progress = msg.time; currentList[idx].duration = msg.duration;
                      if (msg.pageTitle) {
                        const matchStagione = msg.pageTitle.match(/Stagione\s*(\d+)/i);
                        const matchEpisodio = msg.pageTitle.match(/Episodio\s*(\d+)/i);
                        if (matchStagione && matchEpisodio) { currentList[idx].episodeInfo = `S${matchStagione[1]} E${matchEpisodio[1]}`; }
                      }
                      if (streamingDomain && msg.url && msg.url.includes(streamingDomain.split('//')[1])) { currentList[idx].lastUrl = msg.url; }
                      setContinueWatching(currentList);
                      await AsyncStorage.setItem(`@continue_watching_${activeProfile.id}`, JSON.stringify(currentList));
                    }
                  }
                } catch(err) {}
              }}
            />
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const MovieCard = ({ item, onPlay, isHistory, myList = [], onToggleList }) => {
  const [isFocused, setIsFocused] = useState(false);
  const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
  const inList = myList.find(x => x.id === item.id);

  return (
    <TouchableOpacity 
      activeOpacity={0.8} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
      style={[styles.card, isFocused && { transform: [{ scale: Platform.isTV ? 1.05 : 1 }], borderColor: 'white', borderWidth: Platform.isTV ? 2 : 0, borderRadius: 12 }]} 
      onPress={() => onPlay(item)}
    >
      <View>
        <Image source={{ uri: item.poster_path ? BASE_IMAGE_URL + item.poster_path : 'https://via.placeholder.com/150x225' }} style={[styles.cardImg, isHistory && {borderBottomLeftRadius: 0, borderBottomRightRadius: 0}]} />
        <TouchableOpacity style={styles.overlayAddBtn} onPress={() => onToggleList(item)}>
          <Text style={{color: 'white', fontWeight: 'bold'}}>{inList ? '✓' : '+'}</Text>
        </TouchableOpacity>
        {item.episodeInfo && ( <View style={styles.episodeBadge}><Text style={styles.episodeBadgeText}>{item.episodeInfo}</Text></View> )}
        {isHistory && ( <View style={styles.progressContainer}><View style={[styles.progressBar, { width: `${progressPercent}%` }]} /></View> )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title || item.name}</Text>
    </TouchableOpacity>
  );
};

const Row = ({ title, data, onPlay, isHistory, myList = [], onToggleList }) => (
  <View style={{marginBottom: 25}}>
    <Text style={styles.rowTitle}>{title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {data.map(item => ( <MovieCard key={item.id} item={item} onPlay={onPlay} isHistory={isHistory} myList={myList} onToggleList={onToggleList} /> ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  splash: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  splashLetter: { color: '#E50914', fontSize: 50, fontWeight: '900', marginHorizontal: -1 }, 
  
  // HEADER FLUTTUANTE
  floatingHeader: { position: 'absolute', top: 0, width: '100%', zIndex: 100, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 40, backgroundColor: 'rgba(0,0,0,0.6)' },
  logo: { color: '#E50914', fontSize: 28, fontWeight: '900', letterSpacing: -1, textShadowColor: 'black', textShadowRadius: 10 },
  searchBar: { backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', padding: 8, borderRadius: 20, paddingHorizontal: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  
  mediaToggleContainer: { flexDirection: 'row', paddingHorizontal: 15, marginTop: 15, marginBottom: 10 },
  mediaToggleBtn: { marginRight: 20, paddingBottom: 5 },
  mediaToggleBtnActive: { borderBottomWidth: 2, borderBottomColor: '#E50914' },
  mediaToggleText: { color: '#aaa', fontWeight: 'bold', fontSize: 16, textShadowColor: 'black', textShadowRadius: 5 },
  mediaToggleTextActive: { color: 'white' },
  
  catBar: { paddingLeft: 10, paddingBottom: 15 },
  catTab: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, marginRight: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  catActive: { backgroundColor: '#E50914', borderColor: '#E50914' },
  catText: { color: '#ddd', fontWeight: 'bold', fontSize: 13 },
  
  // HERO CAROUSEL
  heroContainer: { width: '100%', backgroundColor: '#000' },
  heroGradient: { height: '100%', justifyContent: 'flex-end', padding: 30, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderBottomWidth: 50, borderBottomColor: 'rgba(0,0,0,0.8)' },
  heroTitle: { color: 'white', fontSize: 36, fontWeight: '900', textAlign: 'center', marginBottom: 20, textShadowColor: 'black', textShadowRadius: 15 },
  dotsContainer: { flexDirection: 'row', position: 'absolute', bottom: 15, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 4 },
  activeDot: { backgroundColor: 'white', width: 8, height: 8, borderRadius: 4, transform: [{translateY: -1}] },
  
  playBtn: { backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 5, marginRight: 10 },
  playBtnText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  heroAddBtn: { backgroundColor: 'rgba(50,50,50,0.8)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  heroAddBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  muteBtn: { position: 'absolute', bottom: 30, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', width: 45, height: 45, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  
  content: { paddingTop: 20 }, // Spazio dopo il carosello
  rowTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginLeft: 15, marginBottom: 15, letterSpacing: -0.5 },
  card: { marginLeft: 15, width: 130 },
  cardImg: { width: 130, height: 195, borderRadius: 8, backgroundColor: '#111' },
  overlayAddBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.7)', width: 25, height: 25, borderRadius: 15, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  progressContainer: { height: 4, width: '100%', backgroundColor: '#333', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#E50914' },
  cardTitle: { color: '#888', fontSize: 12, marginTop: 8, textAlign: 'center', fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  searchGrid: { padding: 10 },
  
  browserBar: { backgroundColor: '#111', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLink: { color: '#E50914', fontWeight: 'bold', fontSize: 12 },
  barTitle: { color: '#444', fontSize: 10, fontWeight: 'bold' },
  
  updateModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  updateBox: { backgroundColor: '#141414', padding: 40, borderRadius: 15, alignItems: 'center', width: '100%', maxWidth: 450, borderWidth: 1, borderColor: '#333' },
  updateTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  updateDesc: { color: '#999', fontSize: 16, textAlign: 'center', marginBottom: 30, lineHeight: 22 },
  updateBtn: { backgroundColor: '#E50914', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 5, width: '100%', alignItems: 'center' },
  updateBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  episodeBadge: { position: 'absolute', top: 5, left: 5, backgroundColor: '#E50914', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, zIndex: 10 },
  episodeBadgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' }
});
