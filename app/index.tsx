import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ImageBackground, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

// --- CONFIGURAZIONE ---
const TMDB_API_KEY = "d3667aaae610489566261eb4cff9f348";
const BASE_IMAGE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";
const STREAMING_DOMAIN = "https://altadefinizione.autos/";

const GENRES = [
  { id: null, name: 'Tutti' },
  { id: 28, name: 'Azione' },
  { id: 35, name: 'Commedia' },
  { id: 27, name: 'Horror' },
  { id: 10749, name: 'Romantico' },
  { id: 878, name: 'Fantascienza' },
  { id: 16, name: 'Animazione' },
];

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

  const webViewRef = useRef(null);
  
  // REFS PER LA MEMORIA
  const currentMovieRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => { historyRef.current = continueWatching; }, [continueWatching]);
  useEffect(() => { currentMovieRef.current = currentMovie; }, [currentMovie]);

  // ANIMAZIONI PREMIUM
  const splashOpacity = useRef(new Animated.Value(1)).current; 
  const globalZoom = useRef(new Animated.Value(1)).current; 
  const glowAnim = useRef(new Animated.Value(0)).current; 
  
  const LETTERS = "NETCHILL".split("");
  const letterAnims = useRef(LETTERS.map(() => new Animated.Value(0))).current;

  const player = useVideoPlayer(videoUrl, p => { if (videoUrl) p.play(); });

  useEffect(() => {
    startCinematicSplash();
    fetchHomeData();
    loadUserData();
  }, []);

  const startCinematicSplash = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/images/tudum.mp3') 
      );
      await sound.playAsync();
    } catch (e) { 
      console.log("Audio non caricato:", e); 
    }

    const letterAnimations = letterAnims.map(anim =>
      Animated.spring(anim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: false })
    );

    Animated.sequence([
      Animated.stagger(120, letterAnimations), 
      Animated.timing(glowAnim, { toValue: 1, duration: 500, useNativeDriver: false }), 
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(globalZoom, { toValue: 15, duration: 700, useNativeDriver: false }),
        Animated.timing(splashOpacity, { toValue: 0, duration: 600, useNativeDriver: false }) 
      ])
    ]).start(() => {
      setShowSplash(false);
    });
  };

  const loadUserData = async () => {
    try {
      const savedHistory = await AsyncStorage.getItem('@continue_watching');
      if (savedHistory) setContinueWatching(JSON.parse(savedHistory));

      const savedList = await AsyncStorage.getItem('@my_list');
      if (savedList) setMyList(JSON.parse(savedList));
    } catch (e) { console.error(e); }
  };

  const toggleMyList = async (item) => {
    try {
      let currentList = [...myList];
      const exists = currentList.find(x => x.id === item.id);
      
      if (exists) {
        currentList = currentList.filter(x => x.id !== item.id);
      } else {
        currentList.unshift({
          id: item.id,
          title: item.title || item.name,
          poster_path: item.poster_path
        });
      }
      setMyList(currentList);
      await AsyncStorage.setItem('@my_list', JSON.stringify(currentList));
    } catch (e) { console.error(e); }
  };

  const startPlaying = async (item) => {
    try {
      let currentHistory = [...continueWatching];
      const existing = currentHistory.find(x => x.id === item.id);
      
      const progressToSave = existing ? existing.progress : 0;
      const durationToSave = existing ? existing.duration : 0;
      const lastUrlToSave = existing ? existing.lastUrl : null; 

      currentHistory = currentHistory.filter(x => x.id !== item.id);
      const newItem = {
        id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        progress: progressToSave,
        duration: durationToSave,
        lastUrl: lastUrlToSave
      };
      
      const updatedList = [newItem, ...currentHistory].slice(0, 10);
      setContinueWatching(updatedList);
      await AsyncStorage.setItem('@continue_watching', JSON.stringify(updatedList));
      
      setCurrentMovie(newItem);

      const finalUrl = lastUrlToSave ? lastUrlToSave : STREAMING_DOMAIN;
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

  // --- NUOVO ROBOT: "IL GPS DEL PLAYER" ---
  const dynamicJS = `
    (function() {
      window.open = function() { return null; };
      setInterval(() => {
        const adSelectors = ['[class*="ads"]', '[id*="ads"]', '.overlay', '.pop-under', 'div[style*="z-index: 9999"]', '.uvlci'];
        adSelectors.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
      }, 1000);

      let initialSavedTime = parseFloat("${currentMovie?.progress || 0}");
      let currentUrl = location.href;
      let hasSeeked = (initialSavedTime < 5);
      let lastSaved = 0;

      function attachToVideo(v) {
        if (!v || v.dataset.hooked) return;
        v.dataset.hooked = "true"; // Evita di riattaccarlo 2 volte

        const trySeek = () => {
          if (!hasSeeked && v.readyState >= 1) {
            if (Math.abs(v.currentTime - initialSavedTime) > 3) {
              v.currentTime = initialSavedTime;
            } else {
              hasSeeked = true; // Salto riuscito!
            }
          }
        };

        // Usa gli eventi nativi del video (molto più stabili)
        v.addEventListener('loadedmetadata', trySeek);
        v.addEventListener('playing', trySeek);

        // Fallback di sicurezza
        const seekInt = setInterval(() => {
          if (hasSeeked) { clearInterval(seekInt); return; }
          trySeek();
        }, 500);

        v.addEventListener('timeupdate', () => {
          // SE CAMBIA L'URL (es: premi "Prossimo Episodio"), AZZERA TUTTO!
          if (location.href !== currentUrl) {
            currentUrl = location.href;
            hasSeeked = true; 
            initialSavedTime = 0;
          }

          // Salva solo se il video sta suonando davvero ed è andato oltre il tempo salvato
          if (hasSeeked && v.currentTime > 0 && !v.paused) {
            if (Math.abs(v.currentTime - lastSaved) > 5) {
              lastSaved = v.currentTime;
              try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: 'TIME_UPDATE', 
                  time: v.currentTime, 
                  duration: v.duration || 0,
                  url: location.href // INVIO L'URL ESATTO IN CUI MI TROVO ORA!
                }));
              } catch(e) {}
            }
          }
        });
      }

      // Cerca continuamente il video e attacca il GPS
      setInterval(() => {
        document.querySelectorAll('video').forEach(attachToVideo);
      }, 1000);
    })();
    true;
  `;

  if (showSplash) {
    const glowColor = glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(229, 9, 20, 0)', 'rgba(229, 9, 20, 0.9)']
    });

    return (
      <Animated.View style={[styles.splash, { opacity: splashOpacity }]}>
        <StatusBar hidden />
        <Animated.View style={{ flexDirection: 'row', transform: [{ scale: globalZoom }] }}>
          {LETTERS.map((letter, index) => {
            return (
              <Animated.Text 
                key={index} 
                style={[
                  styles.splashLetter, 
                  { 
                    opacity: letterAnims[index], 
                    transform: [
                      { scale: letterAnims[index] }, 
                      { translateY: letterAnims[index].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) } 
                    ],
                    textShadowColor: glowColor,
                    textShadowRadius: 15,
                  }
                ]}
              >
                {letter}
              </Animated.Text>
            );
          })}
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {setView('home'); setSelectedGenre(null); fetchHomeData();}}>
          <Text style={styles.logo}>NETCHILL</Text>
        </TouchableOpacity>
        <TextInput 
          style={styles.searchBar} 
          placeholder="Cerca film o serie..." 
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
      </View>

      {!targetUrl && (
        <View style={styles.catBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {GENRES.map(g => (
              <TouchableOpacity 
                key={g.id} 
                style={[styles.catTab, selectedGenre === g.id && styles.catActive]}
                onPress={() => { setSelectedGenre(g.id); fetchHomeData(g.id); }}
              >
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
                    <Row title="Continua a guardare" data={continueWatching} onPlay={startPlaying} isHistory myList={myList} onToggleList={toggleMyList} />
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
                  <TouchableOpacity key={m.id} style={styles.card} onPress={() => startPlaying(m)}>
                    <Image source={{ uri: m.poster_path ? BASE_IMAGE_URL + m.poster_path : 'https://via.placeholder.com/150x225' }} style={styles.cardImg} />
                    <TouchableOpacity style={styles.overlayAddBtn} onPress={() => toggleMyList(m)}>
                      <Text style={{color: 'white', fontWeight: 'bold'}}>{myList.find(x => x.id === m.id) ? '✓' : '+'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.cardTitle} numberOfLines={1}>{m.title || m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={{flex: 1}}>
          <View style={styles.browserBar}>
            <TouchableOpacity onPress={() => webViewRef.current?.goBack()}>
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
            
            // Ho RIMOSSO il vecchio onNavigationStateChange che ti resettava tutto a 0!
            
            // ORA TUTTO AVVIENE QUI DENTRO IN MODO SICURO
            onMessage={async (e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === 'TIME_UPDATE' && currentMovieRef.current) {
                  let currentList = [...historyRef.current];
                  const idx = currentList.findIndex(x => x.id === currentMovieRef.current.id);
                  if (idx > -1) {
                    currentList[idx].progress = msg.time;
                    currentList[idx].duration = msg.duration;
                    
                    // Salva l'URL solo se è un link vero del sito, ignorando le pubblicità!
                    if (msg.url && msg.url.includes('streamingcommunity')) {
                      currentList[idx].lastUrl = msg.url;
                    }
                    
                    setContinueWatching(currentList);
                    await AsyncStorage.setItem('@continue_watching', JSON.stringify(currentList));
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

const Row = ({ title, data, onPlay, isHistory, myList = [], onToggleList }) => (
  <View style={{marginBottom: 25}}>
    <Text style={styles.rowTitle}>{title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {data.map(item => {
        const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
        const inList = myList.find(x => x.id === item.id);
        
        return (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => onPlay(item)}>
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
      })}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  splash: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  splashLetter: { color: '#E50914', fontSize: 50, fontWeight: '900', marginHorizontal: -1 }, 
  header: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { color: '#E50914', fontSize: 26, fontWeight: 'bold', letterSpacing: -1 },
  searchBar: { backgroundColor: '#1A1A1A', color: 'white', padding: 10, borderRadius: 20, width: '60%', paddingHorizontal: 15 },
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
  overlayAddBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.7)', width: 25, height: 25, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  progressContainer: { height: 4, width: '100%', backgroundColor: '#333', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#E50914' },
  cardTitle: { color: '#666', fontSize: 11, marginTop: 8, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  searchGrid: { padding: 10 },
  browserBar: { backgroundColor: '#111', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLink: { color: '#E50914', fontWeight: 'bold', fontSize: 12 },
  barTitle: { color: '#444', fontSize: 10, fontWeight: 'bold' }
});
