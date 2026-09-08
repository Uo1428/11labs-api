const USE_CASE_LABELS: Record<string, string> = {
  narrative_story: "Narrative story",
  conversational: "Conversational",
  informative_educational: "Educational",
  social_media: "Social media",
  characters_animation: "Animation",
  advertisement: "Advertisement",
  entertainment_tv: "TV & entertainment",
  entertainment: "Entertainment",
  news_reporting: "News reporting",
  narration: "Narration",
  documentary: "Documentary",
  video_games: "Video games",
  gaming: "Gaming",
  audiobook: "Audiobook",
  podcast: "Podcast",
  voice_actor: "Voice actor",
  virtual_assistant: "Virtual assistant",
  assistant: "Assistant",
  elearning: "E-learning",
  meditation: "Meditation",
  telephony: "Telephony",
  interactive_books: "Interactive books",
  language_learning: "Language learning",
  accessibility: "Accessibility",
  cinematic: "Cinematic",
  character: "Character",
  animated: "Animated",
  other: "Other",
};

/** Humanize an ElevenLabs use_case slug into a display label. */
export function formatUseCase(value?: string): string | null {
  if (!value) return null;
  const key = value.toLowerCase();
  const known = USE_CASE_LABELS[key];
  if (known) return known;
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}