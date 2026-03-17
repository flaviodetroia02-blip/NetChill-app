import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  StatusBar,
  TextInput,
} from 'react-native';
import { Video } from 'expo-av';

const CAROUSEL_SECTIONS = [
  { id: 'most-watched', title: 'I più visti' },
  { id: 'new-releases', title: 'Nuove uscite' },
  { id: 'action', title: 'Azione' },
];

const POSTERS = Array.from({ length: 10 }).map((_, index) => ({
  id: `poster-${index}`,
  uri: `https://picsum.photos/200/300?random=${index + 1}`,
}));

export default function HomeScreen() {
  const [videoUrl, setVideoUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>VEEZIE AI</Text>
          <Text style={styles.searchText}>Cerca</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Input URL video */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Incolla URL video es. .mp4"
              placeholderTextColor="#888888"
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Hero Section / Video Player */}
          {isPlaying ? (
            <View style={styles.heroContainer}>
              <Video
                style={styles.video}
                source={{ uri: videoUrl }}
                useNativeControls
                shouldPlay
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.closeVideoButton}
                onPress={() => setIsPlaying(false)}
              >
                <Text style={styles.closeVideoText}>Chiudi Video</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.heroContainer}>
              <Image
                source={{ uri: 'https://picsum.photos/400/600' }}
                style={styles.heroImage}
                resizeMode="cover"
              />
              <View style={styles.heroButtonsContainer}>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => {
                    if (videoUrl.trim().length > 0) {
                      setIsPlaying(true);
                    }
                  }}
                >
                  <Text style={styles.playButtonText}>Riproduci</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.myListButton}>
                  <Text style={styles.myListButtonText}>La mia lista</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Carousels */}
          {CAROUSEL_SECTIONS.map((section) => (
            <View key={section.id} style={styles.carouselSection}>
              <Text style={styles.carouselTitle}>{section.title}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {POSTERS.map((poster) => (
                  <Image
                    key={poster.id}
                    source={{ uri: poster.uri }}
                    style={styles.posterImage}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#141414',
  },
  container: {
    flex: 1,
    backgroundColor: '#141414',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  logoText: {
    color: '#E50914',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  searchText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  heroImage: {
    width: '100%',
    height: 400,
  },
  video: {
    width: '100%',
    height: 250,
    backgroundColor: '#000000',
  },
  heroButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 12,
  },
  playButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  myListButton: {
    backgroundColor: '#333333',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  myListButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  closeVideoButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E50914',
  },
  closeVideoText: {
    color: '#E50914',
    fontWeight: '600',
    fontSize: 14,
  },
  carouselSection: {
    marginBottom: 24,
  },
  carouselTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    marginBottom: 8,
  },
  horizontalScrollContent: {
    paddingHorizontal: 16,
  },
  posterImage: {
    width: 120,
    height: 180,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#222222',
  },
});
