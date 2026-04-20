import React, { useState, useEffect, useRef } from 'react';
import { 
  UserPlus, Calendar, BrainCircuit, Trash2, X, Plus, 
  Sparkles, Activity, Tag, User, MessageCircleHeart, Send, Menu,
  Briefcase, Coffee, Home, UserCircle, Download, Upload, PlayCircle, Archive, Battery, Zap, Mic,
  Network, IdCard, RotateCcw
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

const STORAGE_KEY = 'relationship_keeper_data_v1';
const CHAT_STORAGE_KEY = 'relationship_keeper_chat_v1';
const ROLEPLAY_STORAGE_KEY = 'relationship_keeper_roleplay_v1';

const readGeminiApiKey = (): string => {
  const importMetaEnv = (import.meta as any)?.env ?? {};
  return (
    importMetaEnv.GEMINI_API_KEY ||
    importMetaEnv.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  );
};

const createAiClient = (): GoogleGenAI => {
  const apiKey = readGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }
  return new GoogleGenAI({ apiKey });
};

const RELATIONSHIP_TEMPLATES = [
  { label: '白紙から作成', icon: UserCircle, relationship: '', traits: [], expectation: 3, category: 'その他' as const },
  { label: '職場の関係', icon: Briefcase, relationship: '職場の同僚/上司', traits: ['仕事優先', '報告が遅い', '完璧主義'], expectation: 3, category: '仕事' as const },
  { label: '友人・知人', icon: Coffee, relationship: '友人', traits: ['ノリが良い', '時間にルーズ', '相談に乗ってくれる'], expectation: 4, category: '友人' as const },
  { label: '家族・親族', icon: Home, relationship: '家族', traits: ['世話焼き', '過干渉', '話を聞かない'], expectation: 5, category: '家族' as const },
];

type Episode = {
  id: string;
  date: string;
  description: string;
  energyDelta?: number;
  impression?: string; // e.g. "😊 良い"
};

type Category = '仕事' | '友人' | '家族' | 'その他';

type Person = {
  id: string;
  name: string;
  relationship: string;
  category?: Category;
  expectationLevel: number; // 1 to 5
  traits: string[];
  episodes: Episode[];
  aiAnalysis?: string;
  episodeSummary?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'model' | 'feedback';
  text: string;
};

export default function App() {
  const [people, setPeople] = useState<Person[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error('Failed to parse logs', e); }
    }
    return [];
  });
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'すべて' | Category>('すべて');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSuggestingNewPerson, setIsSuggestingNewPerson] = useState(false);
  const [newPersonSuggestion, setNewPersonSuggestion] = useState<string | null>(null);

  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: '1', role: 'model', text: 'お疲れ様です！人間関係の愚痴でも、ただの雑談でも、なんでも聞きますよ☕️' }
    ];
  });
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Roleplay state
  const [roleplayState, setRoleplayState] = useState<{
    isOpen: boolean;
    personId: string | null;
    messages: ChatMessage[];
    step: 'playing' | 'feedback';
    loading: boolean;
  }>(() => {
    const saved = localStorage.getItem(ROLEPLAY_STORAGE_KEY);
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        return { ...parsed, loading: false, isOpen: false };
      } catch (e) {}
    }
    return { isOpen: false, personId: null, messages: [], step: 'playing', loading: false };
  });
  const [roleplayInput, setRoleplayInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Episode Form State
  const [newEpisodeDate, setNewEpisodeDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEpisodeDesc, setNewEpisodeDesc] = useState('');
  const [newEpisodeImpression, setNewEpisodeImpression] = useState('🤔 普通');

  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);
  const [descSentiment, setDescSentiment] = useState<'positive' | 'negative' | 'neutral'>('neutral');
  const recognitionRef = useRef<any>(null);
  const currentDescRef = useRef(newEpisodeDesc);

  useEffect(() => {
    currentDescRef.current = newEpisodeDesc;
  }, [newEpisodeDesc]);

  const analyzeVoiceSentiment = async (text: string) => {
    setIsAnalyzingSentiment(true);
    try {
      const apiKey = readGeminiApiKey();
      if (!apiKey) return;
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `あなたは感情分析AIです。以下のテキストがポジティブかネガティブかニュートラルかを判定し、その1単語（Positive, Negative, Neutral）のみを出力してください。\n\n「${text}」`;
      const res = await ai.models.generateContent({ model: 'gemini-3.1-flash-preview', contents: prompt });
      const result = res.text?.toLowerCase() || '';
      
      if (result.includes('positive')) {
        setDescSentiment('positive');
        setNewEpisodeImpression('😊 良い');
      } else if (result.includes('negative')) {
        setDescSentiment('negative');
        setNewEpisodeImpression('😭 疲れた'); // Or generic negative
      } else {
        setDescSentiment('neutral');
        setNewEpisodeImpression('🤔 普通');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzingSentiment(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setAlertDialog({ isOpen: true, title: '非対応', message: 'お使いのブラウザは音声入力に対応していません。(ChromeやSafariなどを推奨します)' });
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ja-JP';
      
      // 直前のテキストを保持して、そこに音声認識結果を追記していく
      const baseText = newEpisodeDesc; 
      
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        // baseText に finalTranscript を加え、さらに入力途中の interim を表示
        const updatedText = baseText + (baseText && finalTranscript ? ' ' : '') + finalTranscript + interimTranscript;
        setNewEpisodeDesc(updatedText);
      };
      
      recognition.onerror = (e: any) => {
        console.error('Speech recognition error', e);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
        const text = currentDescRef.current.trim();
        if (text) {
          analyzeVoiceSentiment(text);
        }
      };
      
      recognitionRef.current = recognition;
      try {
        recognition.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
        setIsListening(false);
      }
    }
  };

  // Custom modals state
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };

  // Auto-save
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
  }, [people]);

  useEffect(() => {
    localStorage.setItem(ROLEPLAY_STORAGE_KEY, JSON.stringify(roleplayState));
  }, [roleplayState]);

  useEffect(() => {
    setSuggestedTags([]); // clear suggested tags when switching person
  }, [selectedId]);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages));
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  const handleAddPerson = (template: typeof RELATIONSHIP_TEMPLATES[0]) => {
    const newPerson: Person = {
      id: Math.random().toString(36).substring(2, 9),
      name: '新しい人物',
      relationship: template.relationship,
      category: template.category,
      expectationLevel: template.expectation,
      traits: template.traits,
      episodes: []
    };
    setPeople([newPerson, ...people]);
    setSelectedId(newPerson.id);
    setIsAddModalOpen(false);
  };

  const deletePerson = (id: string) => {
    confirmAction(
      '人物の削除',
      'この人物の記録を完全に削除しますか？',
      () => {
        setPeople(people.filter(p => p.id !== id));
        if (selectedId === id) setSelectedId(null);
      }
    );
  };

  const updatePerson = (id: string, updates: Partial<Person>) => {
    setPeople(people.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const activePerson = people.find(p => p.id === selectedId) || null;

  const suggestTraits = async () => {
    if (!activePerson) return;
    setIsSuggestingTags(true);
    setSuggestedTags([]);
    try {
      const ai = createAiClient();
      
      const prompt = `あなたは心理学の専門家です。以下の人物のエピソードと基本情報から、この人の性格や行動パターンを表す短めの「特性タグ」（例：完璧主義, 寂しがりや, 承認欲求強め, 気まぐれ, 責任感が強い 等）を5つ提案してください。
結果はカンマ区切りの文字列（例: タグ1,タグ2,タグ3,タグ4,タグ5）のみを出力してください。

名前: ${activePerson.name || '名前なし'}
関係性: ${activePerson.relationship || '不明'}
現在のタグ: ${activePerson.traits.length > 0 ? activePerson.traits.join(', ') : 'なし'}
エピソード:
${activePerson.episodes.length > 0 ? activePerson.episodes.map(e => `- ${e.description}`).join('\n') : 'まだ記録はありません（推測してください）'}
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: prompt,
      });
      
      const text = response.text || '';
      const tags = text.split(/[、,]/)
        .map(t => t.trim().replace(/^['"-]/, '').trim())
        .filter(t => t && !activePerson.traits.includes(t))
        .slice(0, 5);
        
      setSuggestedTags(tags);
    } catch (error) {
      console.error('Failed to suggest tags', error);
      setAlertDialog({
        isOpen: true,
        title: '提案エラー',
        message: 'タグの提案に失敗しました。もう一度お試しください。'
      });
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const analyzeBehavior = async () => {
    if (!activePerson) return;
    setIsAnalyzing(true);
    
    try {
      const ai = createAiClient();
      
      const prompt = `あなたは心理学と人間関係の専門家であり、ユーモアのセンスを持った親身なアドバイザーです。
以下の人物についてのプロフィールと過去の行動エピソードの記録を分析し、
1. この人物の『今の状態や行動傾向』
2. この人物への適切な『期待値』とメンタルを保つための心構え
3. 【最重要】次に会った時に振るべき話題や、関係をより良くする（または適度な距離を保つ）ための具体的なアクション・セリフ例を箇条書きで３つ以上提案

上記をプレーンなテキスト（またはマークダウン）で作成してください。
冷徹になりすぎず、人間関係で疲れているユーザーの心の負担を減らすトーンでお願いします。不要な前置きは省き、すぐに分析結果から記述してください。出力は必ず自然な日本語で行ってください。

【対象人物の情報】
名前: ${activePerson.name || '名前なし'}
関係性: ${activePerson.relationship || '不明'}
設定している期待値レベル（1:悟り 〜 5:期待大）: ${activePerson.expectationLevel} / 5
特性タグ: ${activePerson.traits.length > 0 ? activePerson.traits.join(', ') : '特になし'}

【古いエピソードの要約】
${activePerson.episodeSummary || 'なし'}

【最近のエピソード記録】
${activePerson.episodes.length > 0 ? activePerson.episodes.map(e => `- ${e.date}: ${e.description} (エネルギー影響: ${e.energyDelta !== undefined ? e.energyDelta : '記録なし'})`).join('\n') : 'エピソードはまだ記録されていません。'}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
      });

      updatePerson(activePerson.id, { aiAnalysis: response.text });
    } catch (error) {
      console.error('Analysis failed:', error);
      setAlertDialog({
        isOpen: true,
        title: '分析エラー',
        message: '分析に失敗しました。時間をおいて再試行してください。'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExport = () => {
    const backupData = {
      version: 2,
      people,
      chatMessages,
      roleplayState
    };
    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `human-relations-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          // Version 1 / legacy format (array of people)
          setPeople(imported);
          setAlertDialog({ isOpen: true, title: '復元完了', message: '人物データを復元しました！（旧フォーマット）' });
        } else if (imported.version >= 2 && imported.people) {
          // Version 2+ format
          setPeople(imported.people);
          if (imported.chatMessages) setChatMessages(imported.chatMessages);
          if (imported.roleplayState) setRoleplayState({ ...imported.roleplayState, isOpen: false, loading: false });
          setAlertDialog({ isOpen: true, title: '復元完了', message: '人物データ、チャット履歴、ロールプレイ記録を復元しました！' });
        } else {
          throw new Error('Invalid format');
        }
      } catch (err) {
        setAlertDialog({ isOpen: true, title: 'エラー', message: 'ファイルの読み込みに失敗しました。形式が正しいか確認してください。' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const summarizeEpisodes = async (personId: string) => {
    const person = people.find(p => p.id === personId);
    if (!person || person.episodes.length <= 5) {
       setAlertDialog({ isOpen: true, title: '保留', message: '要約するほどエピソードがたまっていません（5件以下）' });
       return;
    }
    
    setIsAnalyzing(true);
    try {
      const ai = createAiClient();
      
      const sortedEps = [...person.episodes].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const epsToKeep = sortedEps.slice(0, 3);
      const epsToSummarize = sortedEps.slice(3);

      const prompt = `以下の古いエピソード群を、この人物の「過去からの行動傾向や特徴、あなたに与えた影響」が分かるように、箇条書き（3〜5行程度）で要約してください。
【以前の要約】
${person.episodeSummary || 'なし'}
【今回要約する対象エピソード】
${epsToSummarize.map(e => `- ${e.date}: ${e.description} (エネルギー影響: ${e.energyDelta !== undefined ? e.energyDelta : '不明'})`).join('\n')}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: prompt
      });

      updatePerson(personId, {
        episodes: epsToKeep,
        episodeSummary: response.text || person.episodeSummary
      });
      setAlertDialog({ isOpen: true, title: '整理完了', message: '古いエピソードをAIが要約し、記憶をスッキリ整理しました！' });
    } catch (error) {
      console.error(error);
      setAlertDialog({ isOpen: true, title: 'エラー', message: '要約に失敗しました。' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startRoleplay = async (personId: string, forceReset: boolean = false) => {
    const person = people.find(p => p.id === personId);
    if (!person) return;

    if (!forceReset && roleplayState.personId === personId && roleplayState.messages.length > 0) {
      setRoleplayState(prev => ({ ...prev, isOpen: true }));
      return;
    }

    setRoleplayState({ isOpen: true, personId, messages: [], step: 'playing', loading: true });
    
    try {
      const ai = createAiClient();

      const prompt = `【システム指示】
あなたは今からユーザーの対話シミュレーション（ロールプレイ）の相手役「${person.name}」を演じます。
関係性: ${person.relationship}
特性: ${person.traits.join(', ')}
過去のエピソード要約: ${person.episodeSummary || 'なし'}

最初のひと言として、関係性に合わせた自然な第一声を、1〜2文でユーザーに投げかけてください（例:「どうしたの？」「お疲れ様です、用件は何ですか？」等）。
必ず「その人になりきった口調」で話してください。AIとしての前置きは不要です。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: prompt
      });

      setRoleplayState(prev => ({
        ...prev, 
        messages: [{ id: Date.now().toString(), role: 'model', text: response.text || '（…）' }],
        loading: false
      }));
    } catch (e) {
      console.error(e);
      setRoleplayState(prev => ({...prev, loading: false, isOpen: false}));
    }
  };

  const handleRoleplaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleplayInput.trim() || roleplayState.loading) return;

    const person = people.find(p => p.id === roleplayState.personId);
    if (!person) return;

    const newMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: roleplayInput };
    const updatedMessages = [...roleplayState.messages, newMsg];
    
    setRoleplayState(prev => ({ ...prev, messages: updatedMessages, loading: true }));
    setRoleplayInput('');

    try {
      const ai = createAiClient();

      const systemInstruction = `あなたはユーザーの対話シミュレーションの相手役「${person.name}」です。
関係性: ${person.relationship}
特性: ${person.traits.join(', ')}

常に「相手役そのもの」として返答し、AIとしてのメタ的な発言は絶対にしないでください。態度や口調も特性に従ってください。`;

      const contents = updatedMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: contents as any,
        config: { systemInstruction }
      });

      setRoleplayState(prev => ({ ...prev, messages: [...prev.messages, { id: Date.now().toString(), role: 'model', text: response.text || '…' }], loading: false }));
    } catch (error) {
       console.error(error);
       setRoleplayState(prev => ({ ...prev, loading: false }));
    }
  };

  const getRoleplayFeedback = async () => {
    setRoleplayState(prev => ({ ...prev, step: 'feedback', loading: true }));
    try {
      const ai = createAiClient();

      const conversation = roleplayState.messages.map(m => `${m.role === 'user' ? 'あなた' : '相手'}: ${m.text}`).join('\n');
      
      const prompt = `あなたはコミュニケーションと心理学の専門家です。以下のロールプレイ（対話シミュレーション）のログを詳細に分析し、ユーザーの選択や発言に対する具体的なフィードバックを行ってください。

以下の構成で、実践的かつ前向きなアドバイスを提供してください：

### 🎯 会話の全体評価
（会話の着地点と、相手の感情の推移を要約）

### ✨ 良かった選択・言い回し
（具体的にどの発言がなぜ効果的だったか、相手の警戒を解いたポイントなど）

### 💡 さらに良くするための改善点
（もし言い換えるならどう伝えるとよりスムーズだったか。相手の特性を踏まえた代替案）

### 🛡️ 実践に向けた心構え
（実際にこの相手と話す際のメンタルモデルや、意識すべきキーワード）

【対話ログ】
${conversation}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
      });

      setRoleplayState(prev => ({ ...prev, messages: [...prev.messages, { id: Date.now().toString(), role: 'feedback', text: response.text || 'フィードバックの生成に失敗しました。' }], loading: false }));
    } catch (e) {
      console.error(e);
      setRoleplayState(prev => ({ ...prev, loading: false }));
    }
  };

  const suggestNewPersonTemplate = async () => {
    if (people.length === 0) return;
    setIsSuggestingNewPerson(true);
    setNewPersonSuggestion(null);
    try {
      const ai = createAiClient();
      
      const peopleContext = people.map(p => `- ${p.relationship} (期待値${p.expectationLevel} / 特性: ${p.traits.join(',')})`).join('\n');
      
      const prompt = `あなたは人間関係の専門家です。
ユーザーが現在抱えている人間関係の傾向（以下）を全体的に分析し、現在のユーザーの環境において「どんな特性を持った新しい人（職業、性格など）」を交遊関係や仕事の仲間に加えると、精神的なバランスが取れたり、より良い影響を受けられるかを提案してください。

【現在の人間関係（関係性 / 期待値 / 特性）】
${peopleContext}

ユーザーが前向きな気持ちで新しいつながりを探せるように、以下の項目を必ず含めて「相性が良い人物像」を提示してください：
1. おすすめの人物像（職業、性格など）
2. その人とどこで出会えそうかのアドバイス
3. その人との関係を深めるための具体的な「共通の趣味やおすすめの話題」
4. 逆に関係を悪化させないための具体的な「避けるべき会話やNGな行動」

出力は自然な日本語で、見出しをつけて読みやすく工夫してください。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
      });

      setNewPersonSuggestion(response.text || '提案の生成に失敗しました。');
    } catch (error) {
      console.error('Failed to suggest new person', error);
      setAlertDialog({
        isOpen: true,
        title: 'エラー',
        message: '分析に失敗しました。もう一度お試しください。'
      });
    } finally {
      setIsSuggestingNewPerson(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const newMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    const updatedMessages = [...chatMessages, newMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const ai = createAiClient();

      const peopleContext = people.length > 0 ? 
        `【ユーザーが登録している人物リスト（関係性 / 期待値1-5 / 特性 / 過去のエピソード）】\n${people.map(p => `- 名前: ${p.name} (${p.relationship}) / 期待値${p.expectationLevel} / 特性: ${p.traits.join(', ')}\n  エピソード: ${p.episodes.length > 0 ? p.episodes.map(e => e.description).join(' | ') : 'なし'}`).join('\n')}` 
        : 'まだ人物は登録されていません。';

      const systemInstruction = `あなたはユーザーの愚痴や雑談を親身に聞いてくれる人間関係の相談相手です。
【重要：感情分析とトーン調整】
ユーザーの直近の発言から感情（落ち込んでいる、怒っている、ニュートラル等）を読み取り、応答のトーンを微調整してください：
- 落ち込んでいる時：ユーモアは控えめにし、深い共感と優しさで寄り添うトーン。「辛かったですね」「自分を責めないでくださいね」など。
- 怒っている時：まずは怒りを100%肯定しつつ、少しクスッとできるユーモアを軽く交えてガス抜きを手伝うトーン。
- ニュートラル/普段の時：持ち前のユーモアと親しみやすさで、気楽で和やかなトーン。

ユーザーが特定の人について相談や質問をしてきた場合は、以下の登録データ（特性、関係性、過去のエピソード）を参考にアドバイスを混ぜてください。出力は自然な日本語で。

${peopleContext}`;

      const contents = updatedMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-preview',
        contents: contents as any,
        config: {
          systemInstruction,
        }
      });

      const replyText = response.text || '（少し考え込んでしまいました）';
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: replyText }]);

    } catch (error) {
       console.error(error);
       setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'ごめんなさい、ちょっと考え込んでしまってうまく返せませんでした。もう一度試してください！' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-pink-500/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-50 w-80 bg-[#0f172a]/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col items-stretch h-full transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 pb-4 border-b border-slate-800/80 flex items-center justify-between gap-3 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-cyan-500/5 pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <img src="./icon.svg" alt="App Logo" className="w-8 h-8 drop-shadow-[0_0_12px_rgba(236,72,153,0.6)]" />
            <h1 className="font-semibold text-lg tracking-wide text-slate-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">人間関係<span className="text-slate-400 font-light">記録帳</span></h1>
          </div>
          <button className="md:hidden p-2 -mr-2 text-slate-400" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative z-10">
          <button 
            onClick={() => { setIsAddModalOpen(true); setIsMobileMenuOpen(false); }}
            className="w-full py-4 px-4 rounded-xl text-cyan-50 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all flex items-center justify-center gap-2 font-medium group"
          >
            <UserPlus size={18} className="text-cyan-400 group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] transition-all" />
            人物を追加
          </button>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide text-sm mt-4 mb-2">
            {['すべて', '仕事', '友人', '家族', 'その他'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat as typeof categoryFilter)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors border font-medium ${categoryFilter === cat ? 'bg-pink-600/20 border-pink-500/50 text-pink-300 shadow-[0_0_10px_rgba(236,72,153,0.3)]' : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          
          <div className="space-y-3 mt-4">
            {people.filter(p => categoryFilter === 'すべて' || p.category === categoryFilter).map(p => {
              const lastMetInfo = p.episodes.length > 0 
                  ? new Date(Math.max(...p.episodes.map(e => new Date(e.date).getTime())))
                  : null;
              const isOverdue = lastMetInfo && (new Date().getTime() - lastMetInfo.getTime() > 30 * 24 * 60 * 60 * 1000);

              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedId(p.id); setIsMobileMenuOpen(false); }}
                  className={`w-full text-left p-4 rounded-2xl transition-all duration-200 border ${
                    selectedId === p.id 
                      ? 'bg-slate-800/80 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.15)] relative overflow-hidden' 
                      : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/60 hover:border-cyan-500/30'
                  }`}
                >
                  {selectedId === p.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
                  <div className="flex justify-between items-center mb-2 gap-2 relative z-10">
                    <div className={`font-semibold text-base truncate ${isOverdue ? 'text-pink-400' : 'text-slate-100'}`}>
                      {p.name || '名前なし'}
                    </div>
                    {isOverdue && (
                      <span className="text-[10px] font-bold bg-pink-500/20 border border-pink-500/30 text-pink-300 px-2 py-1 rounded-full shrink-0 flex items-center gap-1 shadow-[0_0_8px_rgba(236,72,153,0.3)]">
                        <span className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(236,72,153,0.8)]"></span>
                        1ヶ月連絡なし
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate flex items-center gap-2 relative z-10">
                    <IdCard size={14} className={selectedId === p.id ? "text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)] shrink-0" : "text-slate-500 shrink-0"} />
                    <span className="truncate">{p.category || 'その他'} • {p.relationship || '関係未設定'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col gap-2 relative z-50">
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImport} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex justify-between items-center px-4 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
            >
              データの復元（インポート） <Upload size={14} />
            </button>
            <button 
              onClick={handleExport}
              className="w-full flex justify-between items-center px-4 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
            >
              データの保存（エクスポート） <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-[#020617] h-full overflow-y-auto relative flex flex-col">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b border-slate-800 bg-[#0f172a] shrink-0 sticky top-0 z-30">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-white">
            <Menu size={24} />
          </button>
          <div className="flex-1 text-center font-semibold text-slate-200 truncate px-4">
            {activePerson ? (activePerson.name || '名前なし') : '人間関係記録帳'}
          </div>
          <div className="w-8" />
        </div>

        {activePerson ? (
          <div className="max-w-4xl mx-auto p-8 pb-32 max-md:p-4 w-full">
            
            <div className="flex justify-between items-start mb-8 max-md:mb-6">
              <div className="flex flex-col gap-4 max-md:gap-3 flex-1 mr-4 md:mr-8">
                <input
                  type="text"
                  value={activePerson.name}
                  onChange={e => updatePerson(activePerson.id, { name: e.target.value })}
                  className="bg-transparent text-4xl max-md:text-2xl font-bold text-slate-100 placeholder-slate-700 focus:outline-none focus:ring-0 border-b border-transparent focus:border-slate-700 pb-1 px-0 transition-colors"
                  placeholder="名前を入力..."
                />
                <input
                  type="text"
                  value={activePerson.relationship}
                  onChange={e => updatePerson(activePerson.id, { relationship: e.target.value })}
                  className="bg-transparent text-slate-400 text-lg max-md:text-base placeholder-slate-700 focus:outline-none focus:ring-0 border-b border-transparent focus:border-slate-800 pb-1 px-0 transition-colors w-full md:w-1/2"
                  placeholder="関係性（例：会社の同僚、古い友人）"
                />
              </div>
              <button 
                onClick={() => deletePerson(activePerson.id)}
                className="p-3 max-md:p-2.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors shrink-0"
                title="この人物を削除"
              >
                <Trash2 size={20} className="max-md:w-5 max-md:h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Properties */}
              <div className="lg:col-span-5 space-y-8">
                
                {/* Expectation Level Slider */}
                <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center text-sm font-semibold text-slate-400">
                      <span className="flex items-center gap-2">
                        <Activity size={16} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" />
                        設定中の期待値
                      </span>
                      <span className="text-cyan-300 font-mono text-lg drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">{activePerson.expectationLevel}</span>
                    </div>
                    
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={activePerson.expectationLevel}
                      onChange={e => updatePerson(activePerson.id, { expectationLevel: parseInt(e.target.value) })}
                      className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                    />
                    
                    <div className="flex justify-between text-xs text-slate-500 font-medium px-1">
                      <span>1: 悟り</span>
                      <span>3: 普通</span>
                      <span>5: 期待大</span>
                    </div>
                  </div>
                </div>

                {/* Traits / Tags */}
                <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                      <Tag size={16} className="text-emerald-400" />
                      性格・特性タグ
                    </div>
                    <button
                      onClick={suggestTraits}
                      disabled={isSuggestingTags}
                      className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-500/10 hover:bg-indigo-500/20 md:px-2.5 md:py-1.5 px-2 py-1 rounded-lg transition-colors border border-indigo-500/20"
                      title={activePerson.episodes.length === 0 ? "エピソードを追加すると提案精度が上がります" : "AIにタグを提案してもらう"}
                    >
                      {isSuggestingTags ? (
                        <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>AI提案</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <AnimatePresence>
                      {activePerson.traits.map(trait => (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          key={trait} 
                          className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 shadow-[0_0_8px_rgba(34,211,238,0.15)]"
                        >
                          {trait}
                          <button 
                            onClick={() => updatePerson(activePerson.id, { traits: activePerson.traits.filter(t => t !== trait) })}
                            className="text-emerald-500 hover:text-emerald-300 shrink-0 ml-1"
                          >
                            <X size={14} />
                          </button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="特性を追加... (Enter)"
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-slate-600 focus:bg-slate-800 text-slate-200 placeholder-slate-600"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          const newTrait = e.currentTarget.value.trim();
                          if (!activePerson.traits.includes(newTrait)) {
                            updatePerson(activePerson.id, { traits: [...activePerson.traits, newTrait] });
                          }
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>

                  <AnimatePresence>
                    {suggestedTags.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }} 
                        className="mt-4 pt-4 border-t border-slate-800/80"
                      >
                        <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
                          <Sparkles size={12} className="text-indigo-400" /> 
                          AIの提案（クリックで追加）
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {suggestedTags.map((tag, idx) => (
                            <button 
                              key={idx}
                              onClick={() => {
                                 updatePerson(activePerson.id, { traits: [...activePerson.traits, tag] });
                                 setSuggestedTags(prev => prev.filter(t => t !== tag));
                              }}
                              className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 hover:border-indigo-500/50 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                            >
                              <Plus size={12} />
                              {tag}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* AI Analysis Button & Output */}
                <div className="space-y-4 pt-4">
                  <div className="flex gap-3">
                    <button
                      onClick={analyzeBehavior}
                      disabled={isAnalyzing}
                      className="flex-1 py-4 px-4 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-500/30 text-indigo-300 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                    >
                      {isAnalyzing ? (
                        <span className="flex items-center gap-2 text-sm">
                           <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                           分析中...
                        </span>
                      ) : (
                        <>
                          <Sparkles size={18} className="group-hover:rotate-12 transition-transform shrink-0" />
                          <span className="text-sm">行動分析</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => startRoleplay(activePerson.id)}
                      className="flex-1 py-4 px-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 text-slate-300 transition-all font-medium flex items-center justify-center gap-2 group"
                    >
                      <PlayCircle size={18} className="text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                      <span className="text-sm">ロールプレイ</span>
                    </button>
                  </div>

                  <AnimatePresence>
                    {activePerson.aiAnalysis && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-6 shadow-inner relative"
                      >
                         <h3 className="flex items-center gap-2 text-indigo-300 font-semibold mb-4 border-b border-indigo-500/20 pb-3">
                           <Sparkles size={18} />
                           ガイドライン
                         </h3>
                         <div className="markdown-body">
                           <ReactMarkdown>{activePerson.aiAnalysis}</ReactMarkdown>
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right Column: Episodes */}
              <div className="lg:col-span-7 bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-md:p-4 flex flex-col max-md:min-h-[500px] md:h-[70vh]">
                <div className="flex items-center justify-between gap-2 text-slate-300 font-semibold mb-6 shrink-0 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} />
                    エピソード記録（事実ログ）
                  </div>
                  {activePerson.episodes.length > 5 && (
                    <button
                      onClick={() => summarizeEpisodes(activePerson.id)}
                      disabled={isAnalyzing}
                      className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-all border border-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.15)] hover:shadow-[0_0_12px_rgba(34,211,238,0.3)] disabled:opacity-50"
                      title="古いエピソードをAIに要約してもらい、リストを整理します"
                    >
                      <Archive size={14} />
                      古い記録を整理
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4">
                  {activePerson.episodeSummary && (
                    <div className="p-4 rounded-xl bg-slate-800/20 border border-slate-700/50 mb-6 text-sm text-slate-300">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2 font-medium"><Archive size={14} /> 過去の要約（AI）</div>
                      <div className="whitespace-pre-wrap opacity-80">{activePerson.episodeSummary}</div>
                    </div>
                  )}
                  {activePerson.episodes.length === 0 ? (
                    <div className="text-slate-600 text-center py-10 whitespace-pre-line text-sm">
                      {`「言ったけどやらなかった」\n「こんな神対応をしてくれた」など\n客観的な事実を日付と共に記録しましょう。`}
                    </div>
                  ) : (
                    activePerson.episodes.map(episode => (
                      <div key={episode.id} className="group flex flex-col p-4 rounded-xl bg-slate-800/30 border border-slate-800/50 hover:border-slate-700 transition-colors">
                        <div className="flex gap-4 w-full">
                          <div className="shrink-0 pt-0.5 text-xs font-mono text-slate-500">
                            {episode.date}
                          </div>
                          <div className="flex-1 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                            {episode.description}
                            
                            {episode.energyDelta !== undefined && (
                              <div className="mt-2.5">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${episode.energyDelta > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : episode.energyDelta < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-700/50 text-slate-400 border border-slate-700'}`}>
                                  {episode.energyDelta > 0 ? <Battery size={12} /> : episode.energyDelta < 0 ? <Zap size={12} /> : <Activity size={12} />}
                                  エネルギー: {episode.energyDelta > 0 ? `+${episode.energyDelta}` : episode.energyDelta}
                                </span>
                              </div>
                            )}
                            {episode.impression && (
                              <div className="mt-2 text-sm text-slate-300 font-medium">
                                印象: {episode.impression}
                              </div>
                            )}
                          </div>
                          <button 
                            onClick={() => {
                              confirmAction(
                                'エピソードの削除',
                                'このエピソードを削除しますか？',
                                () => {
                                  updatePerson(activePerson.id, {
                                    episodes: activePerson.episodes.filter(e => e.id !== episode.id)
                                  });
                                }
                              );
                            }}
                            className="opacity-0 group-hover:opacity-100 max-md:opacity-100 text-slate-600 hover:text-red-400 transition-opacity p-1.5 shrink-0 self-start"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add New Episode form */}
                <div className="shrink-0 pt-6 border-t border-slate-800 mt-2">
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      
                      const date = newEpisodeDate;
                      const description = newEpisodeDesc.trim();
                      const impression = newEpisodeImpression;
                      
                      if (date && description) {
                        const newEp: Episode = {
                          id: Math.random().toString(36).substring(2, 9),
                          date,
                          description,
                          impression
                        };
                        updatePerson(activePerson.id, {
                          episodes: [newEp, ...activePerson.episodes]
                        });
                        setNewEpisodeDesc('');
                        setNewEpisodeImpression('🤔 普通');
                        setDescSentiment('neutral');
                      }
                    }}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        required
                        value={newEpisodeDate}
                        onChange={(e) => setNewEpisodeDate(e.target.value)}
                        className="bg-slate-800 text-slate-300 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 shrink-0"
                      />
                      <button 
                        type="button"
                        onClick={() => setNewEpisodeDate(new Date().toISOString().split('T')[0])}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap"
                      >
                        今日
                      </button>
                    </div>

                    <div className="relative flex items-center">
                      <input 
                        type="text" 
                        required
                        value={newEpisodeDesc}
                        onChange={(e) => {
                          setNewEpisodeDesc(e.target.value);
                          if (descSentiment !== 'neutral') setDescSentiment('neutral');
                        }}
                        placeholder="何がありましたか？客観的な事実を入力..."
                        className={`w-full text-slate-200 border rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none placeholder-slate-500 transition-colors ${
                          descSentiment === 'positive'
                            ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)] focus:border-emerald-400'
                            : descSentiment === 'negative'
                              ? 'bg-red-500/10 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)] focus:border-red-400'
                              : 'bg-slate-800 border-slate-700 focus:border-indigo-500'
                        }`}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={toggleListening}
                        disabled={isAnalyzingSentiment}
                        className={`absolute right-2 p-2 rounded-xl transition-all duration-300 ${
                          isListening 
                            ? 'text-red-400 bg-red-400/10 shadow-[0_0_15px_rgba(248,113,113,0.4)] animate-pulse' 
                            : isAnalyzingSentiment
                            ? 'text-indigo-400 bg-indigo-500/10 animate-pulse'
                            : 'text-slate-400 hover:text-indigo-400 hover:bg-slate-700'
                        }`}
                        title={isListening ? '録音停止' : '音声で入力'}
                      >
                        {isAnalyzingSentiment ? <Sparkles size={18} className="animate-spin-slow" /> : <Mic size={18} className={isListening ? 'animate-pulse' : ''} />}
                      </button>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-1">
                      <span className="text-xs text-slate-400 font-medium">相手の印象・温度感</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['😊 良い', '🤔 普通', '🔥 熱い', '💤 微妙', '😭 疲れた', '😡 怒り'].map(imp => (
                          <button
                            key={imp}
                            type="button"
                            onClick={() => setNewEpisodeImpression(imp)}
                            className={`py-2 px-2 text-sm rounded-xl border transition-colors ${
                              newEpisodeImpression === imp 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {imp}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2 shadow-lg shadow-indigo-500/20 active:scale-95">
                      <Plus size={18} />
                      新しく記録する
                    </button>
                  </form>
                </div>

              </div>

            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-20 px-6 text-center overflow-y-auto">
            {!newPersonSuggestion ? (
              <>
                <img src="./icon.svg" alt="App Logo" className="w-16 h-16 mb-4 opacity-70 grayscale contrast-125" />
                <p className="text-lg mb-2">人物を選択するか、新しく追加してください。</p>
                <p className="text-sm opacity-60">データはブラウザ内にのみ保存されます。</p>
                
                <div className="flex gap-4 mt-6 max-md:flex-col items-center">
                  <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="md:hidden py-3 px-6 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 font-medium w-full justify-center shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                  >
                    <Menu size={18} />
                    メニューを開く
                  </button>
                  <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="max-md:hidden py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/40 flex items-center gap-2 font-medium hover:from-cyan-500/20 hover:to-blue-500/20 transition-all shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] group"
                  >
                    <UserPlus size={18} className="group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    新しく人物を追加
                  </button>

                  {people.length > 0 && (
                    <button
                      onClick={suggestNewPersonTemplate}
                      disabled={isSuggestingNewPerson}
                      className="py-3 px-6 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 text-pink-300 border border-pink-500/40 flex items-center justify-center gap-2 font-medium hover:from-pink-500/20 hover:to-purple-500/20 transition-all shadow-[0_0_15px_rgba(236,72,153,0.2)] hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] disabled:opacity-50 max-md:w-full group"
                    >
                      {isSuggestingNewPerson ? (
                        <div className="w-5 h-5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Network size={18} className="group-hover:drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
                      )}
                      相性の良い人物像を分析
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="max-w-2xl text-left bg-slate-900/40 backdrop-blur-md border border-pink-500/30 p-8 max-md:p-5 rounded-2xl shadow-[0_0_30px_rgba(236,72,153,0.05)] relative w-full mt-10">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-cyan-500/5 rounded-2xl pointer-events-none" />
                <button 
                  onClick={() => setNewPersonSuggestion(null)} 
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
                >
                  <X size={20} />
                </button>
                <h3 className="flex items-center gap-2 text-pink-300 font-semibold mb-6 border-b border-pink-500/20 pb-3 text-lg md:text-xl relative z-10 drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]">
                  <Network size={20} className="shrink-0 text-pink-400" />
                  今のあなたにおすすめの人物像
                </h3>
                <div className="markdown-body prose-sm md:prose-base prose-invert text-slate-300">
                  <ReactMarkdown>{newPersonSuggestion}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Chat Button */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.button 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-105 z-40"
          >
            <MessageCircleHeart size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 max-md:bottom-4 max-md:right-4 w-96 max-md:w-[calc(100vw-2rem)] h-[32rem] max-md:h-[75vh] bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden"
          >
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircleHeart className="text-emerald-400" size={20} />
                <span className="font-semibold text-slate-200">一息・雑談ルーム</span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    confirmAction(
                      '履歴の消去',
                      'チャットの履歴をすべて消去しますか？',
                      () => {
                        setChatMessages([{ id: Date.now().toString(), role: 'model', text: 'お疲れ様です！人間関係の愚痴でも、ただの雑談でも、なんでも聞きますよ☕️' }]);
                      }
                    );
                  }}
                  className="text-slate-400 hover:text-red-400 transition-colors"
                  title="履歴を消去"
                >
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white transition-colors" title="閉じる">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Quick Action for Active Person */}
            {activePerson && activePerson.name && (
              <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 shrink-0 flex items-center">
                <button 
                  onClick={() => {
                    setChatInput(`${activePerson.name}さんとの今後の関わり方について、少しアドバイスをもらえますか？`);
                  }}
                  className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles size={12} />
                  <span>{activePerson.name}さんについて相談する</span>
                </button>
              </div>
            )}
            
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600/80 text-white rounded-br-sm' 
                      : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
                  }`}>
                    <div className="markdown-body prose-sm prose-invert p-0 m-0 [&>p]:mb-1 [&>p:last-child]:mb-0">
                       <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-bl-sm flex gap-1.5 h-10 items-center">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.1s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input form */}
            <form 
              onSubmit={handleChatSubmit}
              className="p-3 bg-slate-800/80 border-t border-slate-700 flex gap-2 shrink-0"
            >
              <input 
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="愚痴や雑談を入力..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 placeholder-slate-500"
              />
              <button 
                type="submit" 
                disabled={!chatInput.trim() || isChatLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center aspect-square"
              >
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Dialog Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl p-6 max-md:p-5 max-w-sm w-full"
            >
              <h3 className="text-lg font-semibold text-slate-100 mb-2">{confirmDialog.title}</h3>
              <p className="text-slate-400 mb-6 max-md:mb-5 text-sm md:text-base">{confirmDialog.message}</p>
              <div className="flex justify-end gap-3 max-md:gap-2">
                <button 
                  onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                  className="px-4 py-2 max-md:px-3 text-sm md:text-base rounded-xl text-slate-300 hover:bg-slate-800 transition-colors font-medium"
                >
                  キャンセル
                </button>
                <button 
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog({ ...confirmDialog, isOpen: false });
                  }}
                  className="px-4 py-2 max-md:px-3 text-sm md:text-base rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors font-medium"
                >
                  削除する
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Alert Dialog Modal */}
      <AnimatePresence>
        {alertDialog.isOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl p-6 max-md:p-5 max-w-sm w-full"
            >
              <h3 className="text-lg font-semibold text-slate-100 mb-2">{alertDialog.title}</h3>
              <p className="text-slate-400 mb-6 max-md:mb-5 text-sm md:text-base">{alertDialog.message}</p>
              <div className="flex justify-end">
                <button 
                  onClick={() => setAlertDialog({ ...alertDialog, isOpen: false })}
                  className="px-5 py-2 max-md:py-1.5 text-sm md:text-base rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-medium"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Person Templates Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl p-6 max-md:p-5 max-w-md w-full relative"
            >
              <div className="flex justify-between items-center mb-6 max-md:mb-4">
                <h3 className="text-xl max-md:text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <UserPlus size={20} className="text-emerald-400 max-md:w-5 max-md:h-5" />
                  新しく人物を追加
                </h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white transition-colors p-1">
                  <X size={20} className="max-md:w-5 max-md:h-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-md:gap-2 max-h-[60vh] overflow-y-auto pr-1">
                {RELATIONSHIP_TEMPLATES.map((tmpl, idx) => {
                  const Icon = tmpl.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAddPerson(tmpl)}
                      className="flex flex-row sm:flex-col items-center sm:justify-center gap-4 sm:gap-3 p-4 max-md:p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-500 transition-all text-left sm:text-center group w-full"
                    >
                      <div className="p-3 max-md:p-2 bg-slate-800 rounded-full group-hover:bg-slate-600 transition-colors shrink-0">
                        <Icon size={24} className="text-emerald-400 max-md:w-5 max-md:h-5" />
                      </div>
                      <div className="flex flex-col sm:items-center flex-1">
                        <div className="font-medium text-slate-200 text-sm md:text-base">{tmpl.label}</div>
                        <div className="text-xs text-slate-400 mt-1 line-clamp-2 max-md:line-clamp-1">
                          {tmpl.traits.length > 0 ? tmpl.traits.join(', ') : 'まっさらな状態から始める'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Roleplay Modal */}
      <AnimatePresence>
        {roleplayState.isOpen && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col h-[80vh] overflow-hidden relative"
            >
              <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <PlayCircle size={20} className="text-indigo-400" />
                  ロールプレイ (予行演習)
                </h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                       confirmAction(
                         'リセット', 
                         'このロールプレイの履歴をリセットして最初からやり直しますか？', 
                         () => startRoleplay(roleplayState.personId!, true)
                       );
                    }}
                    className="text-xs text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-1.5 rounded-lg bg-cyan-500/10 transition-all shadow-[0_0_8px_rgba(34,211,238,0.15)] hover:shadow-[0_0_12px_rgba(34,211,238,0.3)] flex items-center gap-1.5"
                  >
                    <RotateCcw size={14} />
                    リセット
                  </button>
                  <button 
                    onClick={() => setRoleplayState(prev => ({...prev, isOpen: false}))} 
                    className="text-slate-400 hover:text-white transition-colors p-1"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0a0f1c]" ref={chatEndRef}>
                {roleplayState.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'feedback' ? 'justify-center' : 'justify-start'}`}>
                    <div className={`${msg.role === 'feedback' ? 'w-full max-w-full my-4' : 'max-w-[85%]'} rounded-2xl px-4 py-3 ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-sm' 
                        : msg.role === 'feedback'
                          ? 'bg-gradient-to-r from-pink-500/10 to-cyan-500/10 border border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.15)] text-slate-200'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                    }`}>
                      {msg.role === 'feedback' && (
                        <div className="flex items-center gap-2 mb-3 text-pink-400 font-semibold border-b border-pink-500/20 pb-2">
                          <BrainCircuit size={18} className="drop-shadow-[0_0_5px_rgba(236,72,153,0.8)]" />
                          <span>AIからのフィードバック</span>
                        </div>
                      )}
                      <div className="markdown-body prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {roleplayState.loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700 text-slate-400 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                      <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                )}
                {/* Auto scroll target */}
                <div 
                  ref={(el) => {
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }} 
                />
              </div>

              <div className="p-4 border-t border-slate-800 bg-slate-900/80">
                {roleplayState.step === 'playing' ? (
                  <form onSubmit={handleRoleplaySubmit} className="flex gap-2">
                    <input
                      type="text"
                      value={roleplayInput}
                      onChange={e => setRoleplayInput(e.target.value)}
                      placeholder="返答を入力..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500"
                      disabled={roleplayState.loading}
                    />
                    <button 
                      type="submit" 
                      disabled={!roleplayInput.trim() || roleplayState.loading}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      <Send size={18} />
                    </button>
                    <button 
                      type="button" 
                      onClick={getRoleplayFeedback}
                      disabled={roleplayState.messages.length < 3 || roleplayState.loading}
                      className="bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/40 rounded-xl px-4 py-3 transition-all shadow-[0_0_10px_rgba(236,72,153,0.15)] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap flex flex-col justify-center items-center"
                    >
                      <span>終了して</span><span className="sm:hidden">評価を見る</span><span className="max-sm:hidden">評価を見る</span>
                    </button>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setRoleplayState(prev => ({...prev, isOpen: false}))}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl px-4 py-3 transition-colors text-center font-medium"
                    >
                      閉じる
                    </button>
                    <button 
                      onClick={() => startRoleplay(roleplayState.personId!, true)}
                      className="flex-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 rounded-xl px-4 py-3 transition-all shadow-[0_0_10px_rgba(34,211,238,0.2)] text-center font-medium flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={18} />
                      もう一度挑戦する
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
