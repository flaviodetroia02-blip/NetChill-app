import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Image, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

// --- CONFIGURAZIONE ---
const TMDB_API_KEY = "d3667aaae610489566261eb4cff9f348";
const BASE_IMAGE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

// IL TUO NUMERO DI VERSIONE ATTUALE (AGGIORNATO ALLA 8)
const APP_VERSION_CODE = 8; 

// I TUOI TELECOMANDI A DISTANZA SU GITHUB
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
  const [sections, setSections] = useState({ trending: [], movies: [], series: [], searchResults: [] });
  const [continueWatching, setContinueWatching] = useState([]); 
  const [myList, setMyList] = useState([]); 
  const [recommendations, setRecommendations] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home'); 
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [targetUrl, setTargetUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [currentMovie, setCurrentMovie] = useState(null); 

  // IMPOSTAZIONE DI BASE
  const [streamingDomain, setStreamingDomain] = useState('https://cb01.tv');

  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const [updateData, setUpdateData] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);

  const webViewRef = useRef(null);
  const currentMovieRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => { historyRef.current = continueWatching; }, [continueWatching]);
  useEffect(() => { currentMovieRef.current = currentMovie; }, [currentMovie]);

  const historyIds = continueWatching.map(x => x.id).join(',');
  const listIds = myList.map(x => x.id).join(',');

  useEffect(() => {
    const buildRecommendations = async () => {
      if (!activeProfile) return;
      try {
        const allItems = [...continueWatching, ...myList];
        if (allItems.length === 0) {
          setRecommendations([]);
          return;
        }

        const genreCounts = {};
        allItems.forEach(item => {
          if (item.genre_ids && Array.isArray(item.genre_ids)) {
            item.genre_ids.forEach(id => {
              genreCounts[id] = (genreCounts[id] || 0) + 1;
            });
          }
        });

        const sortedGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]);
        if (sortedGenres.length === 0) return;
        const topGenre = sortedGenres[0];

        const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=it-IT&sort_by=popularity.desc&with_genres=${topGenre}`).then(r => r.json());

        const knownIds = new Set(allItems.map(i => i.id));
        const freshMovies = res.results.filter(m => !knownIds.has(m.id)).slice(0, 10);

        setRecommendations(freshMovies);
      } catch(e) { console.log("Errore algoritmo", e); }
    };

    buildRecommendations();
  }, [historyIds, listIds, activeProfile]);

  useEffect(() => {
    const backAction = () => {
      if (targetUrl) {
        if (webViewRef.current) webViewRef.current.goBack();
        return true; 
      }
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

  const checkForUpdates = async () => {
    try {
      const response = await fetch(GITHUB_UPDATE_LINK + '?t=' + new Date().getTime());
      if (response.ok) {
        const data = await response.json();
        if (data.versionCode > APP_VERSION_CODE) {
          setUpdateData(data);
        }
      }
    } catch (e) {}
  };

  const fetchTrailer = async (id, mediaType) => {
    try {
      const type = mediaType === 'tv' ? 'tv' : 'movie';
      let res = await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${TMDB_API_KEY}&language=it-IT`).then(r => r.json());
      if (!res.results || res.results.length === 0) {
        res = await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${TMDB_API_KEY}&language=en-US`).then(r => r.json());
      }
      const trailer = res.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') || res.results?.find(v => v.site === 'YouTube') || res.results?.[0];
      if (trailer) {
        setTrailerKey(trailer.key);
      } else {
        setTrailerKey(null);
      }
    } catch (e) {
      setTrailerKey(null);
    }
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
      if (savedProfiles) {
        setProfiles(JSON.parse(savedProfiles));
      } else {
        const defaultProfile = [{ id: '1', name: 'Ospite', avatar: '😎' }];
        setProfiles(defaultProfile);
        await AsyncStorage.setItem('@profiles', JSON.stringify(defaultProfile));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeProfile) loadUserData(activeProfile.id);
  }, [activeProfile]);

  const loadUserData = async (profileId) => {
    try {
      const savedHistory = await AsyncStorage.getItem(`@continue_watching_${profileId}`);
      if (savedHistory) setContinueWatching(JSON.parse(savedHistory));
      else setContinueWatching([]); 

      const savedList = await AsyncStorage.getItem(`@my_list_${profileId}`);
      if (savedList) setMyList(JSON.parse(savedList));
      else setMyList([]);
    } catch (e) { console.error(e); }
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
        currentList.unshift({ id: item.id, title: item.title || item.name, poster_path: item.poster_path, genre_ids: item.genre_ids });
      }
      setMyList(currentList);
      await AsyncStorage.setItem(`@my_list_${activeProfile.id}`, JSON.stringify(currentList));
    } catch (e) {}
  };

  const startPlaying = async (item) => {
    if (!activeProfile) return;
    try {
      let currentHistory = [...continueWatching];
      const existing = currentHistory.find(x => x.id === item.id);
      
      const progressToSave = existing ? existing.progress : 0;
      const durationToSave = existing ? existing.duration : 0;
      const lastUrlToSave = existing ? existing.lastUrl : null; 
      const episodeInfoToSave = existing ? existing.episodeInfo : null;

      currentHistory = currentHistory.filter(x => x.id !== item.id);
      const newItem = {
        id: item.id, title: item.title || item.name, poster_path: item.poster_path,
        progress: progressToSave, duration: durationToSave, lastUrl: lastUrlToSave, episodeInfo: episodeInfoToSave,
        genre_ids: item.genre_ids || existing?.genre_ids 
      };
      
      const updatedList = [newItem, ...currentHistory].slice(0, 10);
      setContinueWatching(updatedList);
      await AsyncStorage.setItem(`@continue_watching_${activeProfile.id}`, JSON.stringify(updatedList));
      setCurrentMovie(newItem);

      // --- IL CECCHINO DEI TITOLI ---
      // 1. Puliamo il titolo dai due punti e trattini
      const cleanTitle = (item.title || item.name).replace(/[^a-zA-Z0-9 ]/g, " ").trim();
      
      // 2. Estraiamo l'anno esatto di uscita dal database grafico
      const releaseYear = item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : '');
      
      // 3. Uniamo Titolo e Anno (es: "The Batman 2022")
      const exactSearch = releaseYear ? `${cleanTitle} ${releaseYear}` : cleanTitle;

      // 4. Inviamo la ricerca perfetta a Cineblog
      const finalUrl = lastUrlToSave ? lastUrlToSave : `${streamingDomain}/?s=${encodeURIComponent(exactSearch)}`;
      setTargetUrl(finalUrl);
    } catch (e) {}
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

      const firstItem = trending.results[0];
      setFeatured(firstItem);
      if (firstItem) {
        fetchTrailer(firstItem.id, firstItem.media_type);
      }
      setSections({ trending: trending.results.slice(1, 15), movies: movies.results, series: series.results, searchResults: [] });
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

  // IL NUOVO SPARTANO AUTOCLICKER E CLEANER PER CB01
  const dynamicJS = `
    (function() {
      window.open = function() { return null; }; // Uccide i popup istantaneamente
      
      document.addEventListener('click', function(e) {
        let target = e.target.closest('a');
        if (target && target.target === '_blank') target.target = '_self'; 
      }, true);

      // SE SIAMO NELLA PAGINA DI RICERCA (?s=)
      if (window.location.search.includes('?s=')) {
        document.body.style.display = 'none'; // Nascondi tutto lo schermo (diventa nero)
        
        // Aspetta mezzo secondo per far caricare la pagina e clicca il primo film!
        setTimeout(() => {
          const firstMovie = document.querySelector('.card a, article a, h2 a, .post-title a');
          if (firstMovie && firstMovie.href) {
            window.location.href = firstMovie.href; // Ti porta dentro il film da solo
          } else {
            // Se non trova niente, ti fa vedere un messaggio di errore al centro
            document.body.style.display = 'flex';
            document.body.style.justifyContent = 'center';
            document.body.style.alignItems = 'center';
            document.body.style.height = '100vh';
            document.body.innerHTML = '<h2 style="color:white; font-family:sans-serif; text-align:center;">Film non trovato nel server<br><br>Torna indietro 😔</h2>';
          }
        }, 500);
      } 
      // SE SIAMO NELLA PAGINA DEL FILM (Fase di pulizia e player)
      else {
        setInterval(() => {
          const junk = ['header', 'footer', '#sidebar', '.sidebar', '.widget-area', '#comments', '.menu', '.logo', '.ads', '.overlay', 'iframe[src*="ad"]'];
          junk.forEach(s => document.querySelectorAll(s).forEach(el => el.style.display = 'none'));

          const main = document.querySelectorAll('main, #content, .content, article');
          main.forEach(el => {
            el.style.width = '100%'; el.style.padding = '0'; el.style.margin = '0';
          });
          document.body.style.backgroundColor = '#000';
          
          // Prova a fare un piccolo scroll verso il video in automatico
          const iframe = document.querySelector('iframe');
          if (iframe && !window.hasScrolledToVideo) {
             iframe.scrollIntoView({behavior: 'smooth', block: 'center'});
             window.hasScrolledToVideo = true;
          }
        }, 800);
      }

      let initialSavedTime = parseFloat("${currentMovie?.progress || 0}");
      let currentUrl = location.href;
      let hasSeeked = (initialSavedTime < 5);
      let lastSaved = 0;

      function attachToVideo(v) {
        if (!v || v.dataset.hooked) return;
        v.dataset.hooked = "true"; 

        const trySeek = () => {
          if (!hasSeeked && v.readyState >= 1) {
            if (Math.abs(v.currentTime - initialSavedTime) > 3) { v.currentTime = initialSavedTime; } 
            else { hasSeeked = true; }
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
            currentUrl = location.href; hasSeeked = true; initialSavedTime = 0;
          }
          if (hasSeeked && v.currentTime > 0 && !v.paused) {
            if (Math.abs(v.currentTime - lastSaved) > 5) {
              lastSaved = v.currentTime;
              try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: 'TIME_UPDATE', 
                  time: v.currentTime, 
                  duration: v.duration || 0, 
                  url: location.href,
                  pageTitle: document.title
                }));
              } catch(e) {}
            }
          }
        });
      }
      setInterval(() => { document.querySelectorAll('video').forEach(attachToVideo); }, 1000);
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
            <Text style={{ color: '#444', marginTop: 50, fontSize: 12 }}>Tieni premuto su un profilo per eliminare</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {updateData && (
        <Modal transparent={true} animationType="fade" visible={!!updateData}>
          <View style={styles.updateModalContainer}>
            <View style={styles.updateBox}>
              <Text style={[styles.logo, { fontSize: 32, marginBottom: 10 }]}>NETCHILL</Text>
              <Text style={styles.updateTitle}>Nuovo Aggiornamento</Text>
              <Text style={styles.updateDesc}>{updateData.message || "È disponibile una nuova versione. Aggiorna ora."}</Text>
              
              <TouchableOpacity style={styles.updateBtn} onPress={() => Linking.openURL(updateData.url)} hasTVPreferredFocus={true}>
                <Text style={styles.updateBtnText}>SCARICA ORA</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setUpdateData(null)}>
                <Text style={{ color: '#666', fontWeight: 'bold' }}>Ricordamelo più tardi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => {setView('home'); setSelectedGenre(null); fetchHomeData();}} hasTVPreferredFocus={view !== 'search'}>
          <Text style={styles.logo}>NETCHILL</Text>
        </TouchableOpacity>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput style={[styles.searchBar, { width: 150, marginRight: 15 }]} placeholder="Cerca..." placeholderTextColor="#666" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={handleSearch} />
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
                <View style={styles.hero}>
                  {trailerKey ? (
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      {/* FIX YOUTUBE DEFINITIVO */}
                      <WebView
                        style={{ flex: 1, backgroundColor: 'black' }}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        source={{ 
                          html: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#000;"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></body></html>`,
                          baseUrl: 'https://www.youtube.com' 
                        }}
                      />
                    </View>
                  ) : (
                    <Image source={{ uri: BACKDROP_URL + featured.backdrop_path }} style={StyleSheet.absoluteFill} />
                  )}
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
                </View>
              )}
              {loading ? <ActivityIndicator color="#E50914" style={{marginTop: 50}} /> : (
                <View style={styles.content}>
                  {continueWatching.length > 0 && !selectedGenre && (
                    <Row title={`Continua a guardare, ${activeProfile.name}`} data={continueWatching} onPlay={startPlaying} isHistory myList={myList} onToggleList={toggleMyList} />
                  )}
                  
                  {recommendations.length > 0 && !selectedGenre && (
                    <Row title={`Scelti per te, ${activeProfile.name}`} data={recommendations} onPlay={startPlaying} myList={myList} onToggleList={toggleMyList} />
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
            <TouchableOpacity onPress={() => { if (webViewRef.current) webViewRef.current.goBack(); }} hasTVPreferredFocus={true}>
              <Text style={styles.barLink}>← INDIETRO</Text>
            </TouchableOpacity>
            <Text style={styles.barTitle}>SHIELD ATTIVO 🛡️</Text>
            <TouchableOpacity onPress={() => { setTargetUrl(''); setCurrentMovie(null); }}>
              <Text style={styles.barLink}>CHIUDI</Text>
            </TouchableOpacity>
          </View>
          
          <WebView 
            ref={webViewRef}
            source={{ uri: targetUrl, headers: { 'Referer': streamingDomain } }}
            userAgent="Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            injectedJavaScript={dynamicJS}
            injectedJavaScriptForMainFrameOnly={false} 
            style={{ flex: 1, backgroundColor: '#000' }}
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
                    
                    if (msg.pageTitle) {
                      const matchStagione = msg.pageTitle.match(/Stagione\s*(\d+)/i);
                      const matchEpisodio = msg.pageTitle.match(/Episodio\s*(\d+)/i);
                      if (matchStagione && matchEpisodio) {
                        currentList[idx].episodeInfo = `S${matchStagione[1]} E${matchEpisodio[1]}`;
                      }
                    }

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
        
        {item.episodeInfo && (
          <View style={styles.episodeBadge}>
            <Text style={styles.episodeBadgeText}>{item.episodeInfo}</Text>
          </View>
        )}

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
  hero: { width: '100%', height: 450, justifyContent: 'flex-end', backgroundColor: '#000', overflow: 'hidden' },
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
