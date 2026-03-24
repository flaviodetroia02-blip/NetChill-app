import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ImageBackground, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

// --- CONFIGURAZIONE ---
const TMDB_API_KEY = "d3667aaae610489566261eb4cff9f348";
const BASE_IMAGE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

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
  const [sections, setSections] = useState({ trending: [], movies: [], series: [], searchResults: [] });
  const [continueWatching, setContinueWatching] = useState([]); 
  const [myList, setMyList] = useState([]); 
  const [featured, setFeatured] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home'); 
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [targetUrl, setTargetUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [currentMovie, setCurrentMovie] = useState(null); 

  // STATI PER L'URL DINAMICO
  const [streamingDomain, setStreamingDomain] = useState(null);
  const [tempDomainInput, setTempDomainInput] = useState('');

  // STATI PER I PROFILI
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const webViewRef = useRef(null);
  const currentMovieRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => { historyRef.current = continueWatching; }, [continueWatching]);
  useEffect(() => { currentMovieRef.current = currentMovie; }, [currentMovie]);

  // ANIMAZIONI
  const splashOpacity = useRef(new Animated.Value(1)).current; 
  const globalZoom = useRef(new Animated.Value(1)).current; 
  const glowAnim = useRef(new Animated.Value(0)).current; 
  const LETTERS = "NETCHILL".split("");
  const letterAnims = useRef(LETTERS.map(() => new Animated.Value(0))).current;

  const player = useVideoPlayer(videoUrl, p => { if (videoUrl) p.play(); });

  useEffect(() => {
    startCinematicSplash();
    fetchHomeData();
    loadInitialConfig();
  }, []);

  // CARICA IL DOMINIO E I PROFILI ALL'AVVIO
  const loadInitialConfig = async () => {
    try {
      const savedDomain = await AsyncStorage.getItem('@streaming_domain');
      if (savedDomain) setStreamingDomain(savedDomain);

      const savedProfiles = await AsyncStorage.getItem('@profiles');
      if (savedProfiles) {
        setProfiles(JSON.parse(savedProfiles));
      } else {
        // Profilo di default se è la primissima volta
        const defaultProfile = [{ id: '1', name: 'Ospite', avatar: '😎' }];
        setProfiles(defaultProfile);
        await AsyncStorage.setItem('@profiles', JSON.stringify(defaultProfile));
      }
    } catch (e) { console.error(e); }
  };

  // QUANDO SELEZIONI UN PROFILO, CARICA I SUOI DATI PRIVATI
  useEffect(() => {
    if (activeProfile) {
      loadUserData(activeProfile.id);
    }
  }, [activeProfile]);

  const loadUserData = async (profileId) => {
    try {
      const savedHistory = await AsyncStorage.getItem(`@continue_watching_${profileId}`);
      if (savedHistory) setContinueWatching(JSON.parse(savedHistory));
      else setContinueWatching([]); // Reset se vuoto

      const savedList = await AsyncStorage.getItem(`@my_list_${profileId}`);
      if (savedList) setMyList(JSON.parse(savedList));
      else setMyList([]);
    } catch (e) { console.error(e); }
  };

  const createProfile = async () => {
    if (newProfileName.trim() === '' || profiles.length >= 4) return;
    const newProfile = {
      id: Date.now().toString(),
      name: newProfileName.trim(),
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]
    };
    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    await AsyncStorage.setItem('@profiles', JSON.stringify(updatedProfiles));
    setNewProfileName('');
    setIsCreatingProfile(false);
  };

  const deleteProfile = async (id) => {
    if (profiles.length <= 1) return; // Non cancellare l'ultimo
    const updatedProfiles = profiles.filter(p => p.id !== id);
    setProfiles(updatedProfiles);
    await AsyncStorage.setItem('@profiles', JSON.stringify(updatedProfiles));
    // Pulizia dei dati del profilo cancellato
    await AsyncStorage.removeItem(`@continue_watching_${id}`);
    await AsyncStorage.removeItem(`@my_list_${id}`);
  };

  const toggleMyList = async (item) => {
    if (!activeProfile) return;
    try {
      let currentList = [...myList];
      const exists = currentList.find(x => x.id === item.id);
      
      if (exists) {
        currentList = currentList.filter(x => x.id !== item.id);
      } else {
        currentList.unshift({ id: item.id, title: item.title || item.name, poster_path: item.poster_path });
      }
      setMyList(currentList);
      await AsyncStorage.setItem(`@my_list_${activeProfile.id}`, JSON.stringify(currentList));
    } catch (e) { console.error(e); }
  };

  const startPlaying = async (item) => {
    if (!activeProfile) return;
    try {
      let currentHistory = [...continueWatching];
      const existing = currentHistory.find(x => x.id === item.id);
      
      const progressToSave = existing ? existing.progress : 0;
      const durationToSave = existing ? existing.duration : 0;
      const lastUrlToSave = existing ? existing.lastUrl : null; 

      currentHistory = currentHistory.filter(x => x.id !== item.id);
      const newItem = {
        id: item.id, title: item.title || item.name, poster_path: item.poster_path,
        progress: progressToSave, duration: durationToSave, lastUrl: lastUrlToSave
      };
      
      const updatedList = [newItem, ...currentHistory].slice(0, 10);
      setContinueWatching(updatedList);
      await AsyncStorage.setItem(`@continue_watching_${activeProfile.id}`, JSON.stringify(updatedList));
      
      setCurrentMovie(newItem);

      const finalUrl = lastUrlToSave ? lastUrlToSave : `${streamingDomain}/it/search?q=${encodeURIComponent(item.title || item.name)}`;
      setTargetUrl(finalUrl);
    } catch (e) { console.error(e); }
  };

  const fetchHomeData = async (genreId = null) => {
    setLoading(true);
    try {
      const gParam = genreId ? `&with_genres=${genreId}` : '';
      const trendingUrl = genreId 
        ? `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc${gParam}`
        : `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=it-IT`;

      const [trending, movies, series] = await Promise.all([
        fetch(trendingUrl).then(res => res.json()),
        fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=vote_count.desc${gParam}`).then(res => res.json()),
        fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc${gParam}`).then(res => res.json()),
      ]);

      setFeatured(trending.results[0]);
      setSections({ trending: trending.results.slice(1, 15), movies: movies.results, series: series.results, searchResults: [] });
      setLoading(false);
    } catch (e) { console.error(e); setLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true); setView('search');
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=it-IT&query=${encodeURIComponent(searchQuery)}`).then(r => r.json());
      setSections(prev => ({ ...prev, searchResults: res.results }));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveNewDomain = async () => {
    if (tempDomainInput.trim() !== '') {
      let finalUrl = tempDomainInput.trim().toLowerCase();
      if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
      await AsyncStorage.setItem('@streaming_domain', finalUrl);
      setStreamingDomain(finalUrl);
    }
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

  const dynamicJS = `
    (function() {
      window.open = function() { return null; };
      
      const nascondiSito = document.createElement('style');
      nascondiSito.innerHTML = \`
        header, footer, nav, .logo, [class*="logo"], [id*="logo"], [class*="menu"],
        .vjs-watermark, .streamingcommunity-logo, [alt*="StreamingCommunity"],
        .site-name, .brand { display: none !important; opacity: 0 !important; pointer-events: none !important; }
        body { background-color: #000 !important; }
      \`;
      document.head.appendChild(nascondiSito);

      setInterval(() => {
        const adSelectors = ['[class*="ads"]', '[id*="ads"]', '.overlay', '.pop-under', 'div[style*="z-index: 9999"]'];
        adSelectors.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
      }, 1000);

      let initialSavedTime = parseFloat("${currentMovie?.progress || 0}");
      let currentUrl = location.href;
      let hasSeeked = (initialSavedTime < 5);
      let lastSaved = 0;

      function attachToVideo(v) {
        if (!v || v.dataset.hooked) return;
        v.dataset.hooked = "true"; 

        const trySeek = () => {
          if (!hasSeeked && v.readyState >= 1) {
            if (Math.abs(v.currentTime - initialSavedTime) > 3) {
              v.currentTime = initialSavedTime;
            } else { hasSeeked = true; }
          }
        };

        v.addEventListener('loadedmetadata', trySeek);
        v.addEventListener('playing', trySeek);

        const seekInt = setInterval(() => {
          if (hasSeeked) { clearInterval(seekInt); return; }
          trySeek();
        }, 500);

        v.addEventListener('timeupdate', () => {
          if (location.href !== currentUrl) {
            currentUrl = location.href;
            hasSeeked = true; 
            initialSavedTime = 0;
          }

          if (hasSeeked && v.currentTime > 0 && !v.paused) {
            if (Math.abs(v.currentTime - lastSaved) > 5) {
              lastSaved = v.currentTime;
              try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: 'TIME_UPDATE', time: v.currentTime, duration: v.duration || 0, url: location.href 
                }));
              } catch(e) {}
            }
          }
        });
      }

      setInterval(() => document.querySelectorAll('video').forEach(attachToVideo), 1000);
    })();
    true;
  `;

  if (showSplash) {
    const glowColor = glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(229, 9, 20, 0)', 'rgba(229, 9, 20, 0.9)'] });
    return (
      <Animated.View style={[styles.splash, { opacity: splashOpacity }]}>
        <StatusBar hidden />
        <Animated.View style={{ flexDirection: 'row', transform: [{ scale: globalZoom }] }}>
          {LETTERS.map((letter, index) => (
            <Animated.Text key={index} style={[styles.splashLetter, { opacity: letterAnims[index], transform: [{ scale: letterAnims[index] }, { translateY: letterAnims[index].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }], textShadowColor: glowColor, textShadowRadius: 15 }]}>
              {letter}
            </Animated.Text>
          ))}
        </Animated.View>
      </Animated.View>
    );
  }

  if (!streamingDomain) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <StatusBar barStyle="light-content" />
        <Text style={[styles.logo, { fontSize: 40, marginBottom: 10 }]}>NETCHILL</Text>
        <Text style={{ color: 'white', fontSize: 16, marginBottom: 30, textAlign: 'center' }}>Inserisci l'URL del sito di streaming per iniziare.</Text>
        <TextInput style={[styles.searchBar, { width: '100%', marginBottom: 20, padding: 15, fontSize: 16 }]} placeholder="es. https://streamingcommunity.com" placeholderTextColor="#666" value={tempDomainInput} onChangeText={setTempDomainInput} autoCapitalize="none" keyboardType="url" />
        <TouchableOpacity style={styles.playBtn} onPress={saveNewDomain} hasTVPreferredFocus={true}>
          <Text style={styles.playBtnText}>SALVA E INIZIA</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --- NUOVA SCHERMATA: SELEZIONE PROFILO ---
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
            <Text style={{ color: '#444', marginTop: 50, fontSize: 12 }}>Tieni premuto su un profilo per eliminarlo</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {setView('home'); setSelectedGenre(null); fetchHomeData();}}
          onLongPress={async () => {
            await AsyncStorage.removeItem('@streaming_domain');
            setStreamingDomain(null); setTempDomainInput(''); setActiveProfile(null);
          }}
          hasTVPreferredFocus={view !== 'search'}
        >
          <Text style={styles.logo}>NETCHILL</Text>
        </TouchableOpacity>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput style={[styles.searchBar, { width: 150, marginRight: 15 }]} placeholder="Cerca..." placeholderTextColor="#666" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={handleSearch} />
          
          {/* TASTO PER CAMBIARE PROFILO IN ALTO A DESTRA */}
          <TouchableOpacity onPress={() => setActiveProfile(null)} style={{ width: 35, height: 35, borderRadius: 5, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 20 }}>{activeProfile.avatar}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!targetUrl && (
        <View style={styles.catBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {GENRES.map(g => (
              <TouchableOpacity key={g.id} style={[styles.catTab, selectedGenre === g.id && styles.catActive]} onPress={() => { setSelectedGenre(g.id); fetchHomeData(g.id); }}>
                <Text style={[styles.catText, selectedGenre === g.id && {color: 'white'}]}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {!targetUrl ? (
        <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false}>
          {view === 'home' ? (
            <>
              {featured && !loading && (
                <ImageBackground source={{ uri: BACKDROP_URL + featured.backdrop_path }} style={styles.hero}>
                  <View style={styles.heroOverlay}>
                    <Text style={styles.heroTitle}>{featured.title || featured.name}</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <TouchableOpacity style={styles.playBtn} onPress={() => startPlaying(featured)}>
                        <Text style={styles.playBtnText}>▶ RIPRODUCI</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.heroAddBtn} onPress={() => toggleMyList(featured)}>
                        <Text style={styles.heroAddBtnText}>{myList.find(x => x.id === featured.id) ? '✓' : '+'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </ImageBackground>
              )}
              {loading ? <ActivityIndicator color="#E50914" style={{marginTop: 50}} /> : (
                <View style={styles.content}>
                  {continueWatching.length > 0 && !selectedGenre && (
                    <Row title={`Continua a guardare, ${activeProfile.name}`} data={continueWatching} onPlay={startPlaying} isHistory myList={myList} onToggleList={toggleMyList} />
                  )}
                  {myList.length > 0 && !selectedGenre && (
                    <Row title="La mia Lista" data={myList} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  )}
                  <Row title={selectedGenre ? "I migliori della categoria" : "Tendenze della settimana"} data={sections.trending} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  <Row title="Film Consigliati" data={sections.movies} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                  <Row title="Serie TV" data={sections.series} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
                </View>
              )}
            </>
          ) : (
            <View style={styles.searchGrid}>
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
        <View style={{flex: 1}}>
          <View style={styles.browserBar}>
            <TouchableOpacity onPress={() => webViewRef.current?.goBack()} hasTVPreferredFocus={true}>
              <Text style={styles.barLink}>← INDIETRO</Text>
            </TouchableOpacity>
            <Text style={styles.barTitle}>SHIELD ATTIVO 🛡️</Text>
            <TouchableOpacity onPress={() => { setTargetUrl(''); setCurrentMovie(null); }}>
              <Text style={styles.barLink}>CHIUDI</Text>
            </TouchableOpacity>
          </View>
          
          <WebView 
            ref={webViewRef}
            source={{ uri: targetUrl }}
            injectedJavaScript={dynamicJS}
            injectedJavaScriptForMainFrameOnly={false} 
            style={{ flex: 1 }}
            allowsInlineMediaPlayback={true}
            allowsFullscreenVideo={true}
            mediaPlaybackRequiresUserAction={false}
            onMessage={async (e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === 'TIME_UPDATE' && currentMovieRef.current && activeProfile) {
                  let currentList = [...historyRef.current];
                  const idx = currentList.findIndex(x => x.id === currentMovieRef.current.id);
                  if (idx > -1) {
                    currentList[idx].progress = msg.time;
                    currentList[idx].duration = msg.duration;
                    if (streamingDomain && msg.url && msg.url.includes(streamingDomain.split('//')[1])) {
                      currentList[idx].lastUrl = msg.url;
                    }
                    setContinueWatching(currentList);
                    await AsyncStorage.setItem(`@continue_watching_${activeProfile.id}`, JSON.stringify(currentList));
                  }
                }
              } catch(err) {}
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const MovieCard = ({ item, onPlay, isHistory, myList = [], onToggleList }) => {
  const [isFocused, setIsFocused] = useState(false);
  const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
  const inList = myList.find(x => x.id === item.id);

  return (
    <TouchableOpacity 
      activeOpacity={0.8}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={[styles.card, isFocused && { transform: [{ scale: Platform.isTV ? 1.05 : 1 }], borderColor: 'white', borderWidth: Platform.isTV ? 2 : 0, borderRadius: 12 }]} 
      onPress={() => onPlay(item)}
    >
      <View>
        <Image source={{ uri: item.poster_path ? BASE_IMAGE_URL + item.poster_path : 'https://via.placeholder.com/150x225' }} style={[styles.cardImg, isHistory && {borderBottomLeftRadius: 0, borderBottomRightRadius: 0}]} />
        <TouchableOpacity style={styles.overlayAddBtn} onPress={() => onToggleList(item)}>
          <Text style={{color: 'white', fontWeight: 'bold'}}>{inList ? '✓' : '+'}</Text>
        </TouchableOpacity>
        {isHistory && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title || item.name}</Text>
    </TouchableOpacity>
  );
};

const Row = ({ title, data, onPlay, isHistory, myList = [], onToggleList }) => (
  <View style={{marginBottom: 25}}>
    <Text style={styles.rowTitle}>{title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {data.map(item => (
        <MovieCard key={item.id} item={item} onPlay={onPlay} isHistory={isHistory} myList={myList} onToggleList={onToggleList} />
      ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  splash: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  splashLetter: { color: '#E50914', fontSize: 50, fontWeight: '900', marginHorizontal: -1 }, 
  header: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { color: '#E50914', fontSize: 26, fontWeight: 'bold', letterSpacing: -1 },
  searchBar: { backgroundColor: '#1A1A1A', color: 'white', padding: 10, borderRadius: 20, paddingHorizontal: 15 },
  catBar: { marginBottom: 15, paddingLeft: 10 },
  catTab: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, marginRight: 10, backgroundColor: '#111' },
  catActive: { backgroundColor: '#E50914' },
  catText: { color: '#666', fontWeight: 'bold', fontSize: 13 },
  hero: { width: '100%', height: 450, justifyContent: 'flex-end' },
  heroOverlay: { height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 30, alignItems: 'center' },
  heroTitle: { color: 'white', fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  playBtn: { backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 5, marginRight: 10 },
  playBtnText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  heroAddBtn: { backgroundColor: 'rgba(50,50,50,0.8)', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5, justifyContent: 'center' },
  heroAddBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  rowTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 15, marginBottom: 15 },
  card: { marginLeft: 15, width: 130 },
  cardImg: { width: 130, height: 195, borderRadius: 10, backgroundColor: '#111' },
  overlayAddBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.7)', width: 25, height: 25, borderRadius: 15, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  progressContainer: { height: 4, width: '100%', backgroundColor: '#333', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#E50914' },
  cardTitle: { color: '#666', fontSize: 11, marginTop: 8, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  searchGrid: { padding: 10 },
  browserBar: { backgroundColor: '#111', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLink: { color: '#E50914', fontWeight: 'bold', fontSize: 12 },
  barTitle: { color: '#444', fontSize: 10, fontWeight: 'bold' }
});
