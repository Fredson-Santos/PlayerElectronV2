// renderer.js - Lógica do Frontend (Processo de Renderização) - ATUALIZADO

document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos da UI
    const loginScreen = document.getElementById('login-screen');
    const mainScreen = document.getElementById('main-screen');
    const playerScreen = document.getElementById('player-screen');
    const loadingSpinner = document.getElementById('loading-spinner');
    const loginForm = document.getElementById('login-form');
    const hostInput = document.getElementById('host');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const categoryList = document.getElementById('category-list');
    const contentGrid = document.getElementById('content-grid');
    const searchBox = document.getElementById('search-box');
    const navBtns = document.querySelectorAll('.nav-btn');
    const videoPlayer = document.getElementById('video-player');
    const backToMainBtn = document.getElementById('back-to-main');
    const playerFeedback = document.getElementById('player-feedback');
    // NOVOS Elementos para o Modal de Séries
    const seriesInfoModal = document.getElementById('series-info-modal');
    const seriesModalTitle = document.getElementById('series-modal-title');
    const seriesModalContent = document.getElementById('series-modal-content');
    const closeSeriesModalBtn = document.getElementById('close-series-modal');


    // Estado da aplicação
    let state = {
        api: null,
        userInfo: null,
        categories: [],
        currentContent: [],
        favorites: JSON.parse(localStorage.getItem('iptv_favorites')) || {},
        watched: JSON.parse(localStorage.getItem('iptv_watched')) || [], // NOVO: Armazena IDs de episódios vistos
        currentSection: 'live',
        currentCategory: null,
        currentStream: null,
        hls: null,
        debounceTimeout: null,
    };

    // --- LÓGICA DE LOGIN E SESSÃO (sem alteração) ---
    const autoLogin = () => {
        const savedCreds = localStorage.getItem('iptv_credentials');
        if (savedCreds) {
            const { host, username, password } = JSON.parse(savedCreds);
            hostInput.value = host;
            usernameInput.value = username;
            passwordInput.value = password;
            rememberMeCheckbox.checked = true;
            handleLogin();
        }
    };

    const handleLogin = async (e) => {
        if (e) e.preventDefault();
        showLoading(true);
        loginError.textContent = '';
        const host = hostInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        if (!host || !username || !password) {
            loginError.textContent = 'Todos os campos são obrigatórios.';
            showLoading(false);
            return;
        }
        state.api = axios.create({ baseURL: host });
        try {
            const response = await state.api.get('/player_api.php', { params: { username, password } });
            if (response.data.user_info.auth === 0) throw new Error('Usuário ou senha inválidos.');
            state.userInfo = response.data.user_info;
            if (rememberMeCheckbox.checked) {
                localStorage.setItem('iptv_credentials', JSON.stringify({ host, username, password }));
            } else {
                localStorage.removeItem('iptv_credentials');
            }
            loginScreen.classList.add('hidden');
            mainScreen.classList.remove('hidden');
            await handleSectionChange({ target: { dataset: { section: 'live' } } }, true);
        } catch (error) {
            console.error('Erro no login:', error);
            loginError.textContent = 'Falha no login. Verifique o host e as credenciais.';
            showLoading(false);
        }
    };

    const handleLogout = () => {
        state = { ...state, api: null, userInfo: null, categories: [], currentContent: [], currentSection: 'live', currentCategory: null, watched: state.watched }; // Mantém os 'vistos'
        if (!rememberMeCheckbox.checked) {
            localStorage.removeItem('iptv_credentials');
            hostInput.value = '';
            usernameInput.value = '';
            passwordInput.value = '';
            rememberMeCheckbox.checked = false;
        }
        mainScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        playerScreen.classList.add('hidden');
        seriesInfoModal.classList.add('hidden');
        stopPlayer();
    };

    // --- BUSCA E RENDERIZAÇÃO DE CONTEÚDO ---
    const fetchAndRenderCategories = async () => {
        showLoading(true);
        state.currentContent = [];
        state.currentCategory = null;
        renderItems([]);
        contentGrid.innerHTML = '<p class="col-span-full text-center text-gray-400">Selecione uma categoria para começar.</p>';
        updateActiveCategoryUI();
        const { username, password } = state.userInfo;
        const actionMap = {
            live: 'get_live_categories',
            movie: 'get_vod_categories',
            series: 'get_series_categories',
        };
        try {
            const res = await state.api.get('/player_api.php', { params: { username, password, action: actionMap[state.currentSection] } });
            state.categories = res.data || [];
            renderCategories();
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            categoryList.innerHTML = '<li>Falha ao carregar.</li>'
        } finally {
            showLoading(false);
        }
    };

    const fetchContentForCategory = async (categoryId) => {
        showLoading(true);
        state.currentCategory = categoryId;
        updateActiveCategoryUI();
        const { username, password } = state.userInfo;
        const actionMap = {
            live: 'get_live_streams',
            movie: 'get_vod_streams',
            series: 'get_series',
        };
        const params = { username, password, action: actionMap[state.currentSection] };
        if (categoryId !== 'all') {
            params.category_id = categoryId;
        }
        try {
            const res = await state.api.get('/player_api.php', { params });
            state.currentContent = res.data || [];
            renderItems(state.currentContent);
        } catch (error) {
            console.error(`Erro ao buscar conteúdo para categoria ${categoryId}:`, error);
            contentGrid.innerHTML = '<p class="col-span-full text-center text-gray-400">Falha ao carregar conteúdo.</p>';
        } finally {
            showLoading(false);
        }
    };
    
    const renderCategories = () => {
        categoryList.innerHTML = '';
        const createCategoryElement = (name, id) => {
            const li = document.createElement('li');
            li.textContent = name;
            li.dataset.category = id;
            li.addEventListener('click', () => handleCategoryClick(id));
            return li;
        };
        // A categoria Favoritos não se aplica a séries da mesma forma, então é ocultada nessa seção.
        if (state.currentSection !== 'series') {
            categoryList.appendChild(createCategoryElement('Todos', 'all'));
            categoryList.appendChild(createCategoryElement('⭐ Favoritos', 'favorites'));
        } else {
            categoryList.appendChild(createCategoryElement('Todas', 'all'));
        }

        (state.categories || []).forEach(cat => {
            categoryList.appendChild(createCategoryElement(cat.category_name, cat.category_id));
        });
    };

    const renderItems = (items) => {
        contentGrid.innerHTML = '';
        if (!items || items.length === 0) {
            if (state.currentCategory) {
                contentGrid.innerHTML = '<p class="col-span-full text-center text-gray-400">Nenhum item encontrado nesta categoria.</p>';
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const card = document.createElement('div');
            card.dataset.id = item.stream_id || item.series_id;
            
            if (state.currentSection === 'live') {
                card.className = 'flex items-center bg-gray-800 rounded-lg p-2 cursor-pointer transition-colors hover:bg-gray-700';
                const iconUrl = item.stream_icon || 'https://placehold.co/160x90/1f2937/FFF?text=?';
                card.innerHTML = `
                    <img src="${iconUrl}" alt="${item.name}" class="w-20 h-12 object-contain mr-4 flex-shrink-0 bg-black/20 rounded-md" onerror="this.onerror=null;this.src='https://placehold.co/160x90/1f2937/FFF?text=${encodeURIComponent(item.name ? item.name[0] : '?')}';">
                    <h3 class="text-sm font-semibold text-white truncate">${item.name}</h3>
                `;
            } else { 
                card.className = 'flex items-center justify-center text-center bg-gray-800 rounded-lg p-3 cursor-pointer h-36 transition-colors hover:bg-gray-700';
                card.innerHTML = `
                    <h3 class="text-sm font-semibold text-white">${item.name || 'Sem nome'}</h3>
                `;
            }
            card.addEventListener('click', () => handleItemClick(item));
            fragment.appendChild(card);
        });
        contentGrid.appendChild(fragment);
    };

    const handleCategoryClick = async (categoryId) => {
        searchBox.value = '';
        if (categoryId === 'favorites') {
            await showFavorites();
        } else {
            await fetchContentForCategory(categoryId);
        }
    };
    
    const updateActiveCategoryUI = () => {
         document.querySelectorAll('#category-list li').forEach(li => {
            li.classList.remove('bg-cyan-600');
            if (li.dataset.category === String(state.currentCategory)) {
                li.classList.add('bg-cyan-600');
            }
        });
    };

    const handleSectionChange = async (e, isInitialLoad = false) => {
        const section = e.target.dataset.section;
        if (section && (section !== state.currentSection || isInitialLoad)) {
            state.currentSection = section;
            navBtns.forEach(btn => btn.classList.remove('active'));
            document.querySelector(`button[data-section="${section}"]`).classList.add('active');
            searchBox.value = '';

            contentGrid.classList.remove('grid-view-detailed', 'grid-view-list');
            if (section === 'live') {
                contentGrid.classList.add('grid-view-list');
            } else {
                contentGrid.classList.add('grid-view-detailed');
            }
            await fetchAndRenderCategories();
        }
    };
    
    const handleSearch = (e) => {
        clearTimeout(state.debounceTimeout);
        const filter = e.target.value.toLowerCase().trim();
        state.debounceTimeout = setTimeout(() => {
            if (!filter) {
                renderItems(state.currentContent);
                return;
            }
            const filteredItems = state.currentContent.filter(item => 
                item.name && item.name.toLowerCase().includes(filter)
            );
            renderItems(filteredItems);
        }, 300);
    };

    // --- LÓGICA DE SÉRIES (NOVA) ---
    const showSeriesInfo = async (series) => {
        showLoading(true);
        seriesModalContent.innerHTML = '';
        const { username, password } = state.userInfo;
        try {
            const res = await state.api.get('/player_api.php', {
                params: { username, password, action: 'get_series_info', series_id: series.series_id }
            });
            const seriesData = res.data;
            seriesModalTitle.textContent = series.name;
            renderSeriesSeasons(seriesData.episodes);
            seriesInfoModal.classList.remove('hidden');
        } catch (error) {
            console.error('Erro ao buscar informações da série:', error);
            alert('Não foi possível carregar os detalhes da série.');
        } finally {
            showLoading(false);
        }
    };

    const renderSeriesSeasons = (seasons) => {
        const fragment = document.createDocumentFragment();
        const seasonNumbers = Object.keys(seasons).sort((a, b) => parseInt(a) - parseInt(b));

        seasonNumbers.forEach(seasonNum => {
            const seasonContainer = document.createElement('div');
            seasonContainer.className = 'mb-6';
            
            const seasonTitle = document.createElement('h3');
            seasonTitle.className = 'text-lg font-semibold text-cyan-400 mb-3';
            seasonTitle.textContent = `Temporada ${seasonNum}`;
            seasonContainer.appendChild(seasonTitle);

            const episodesList = document.createElement('ul');
            episodesList.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2';
            
            seasons[seasonNum].forEach(episode => {
                const isWatched = state.watched.includes(episode.id);
                const li = document.createElement('li');
                li.className = `p-2 rounded cursor-pointer transition-colors ${
                    isWatched 
                        ? 'bg-gray-700 text-gray-500 hover:bg-gray-600'
                        : 'bg-gray-900 hover:bg-gray-700'
                }`;
                li.textContent = `${episode.episode_num}. ${episode.title || 'Episódio sem título'}`;
                if (isWatched) {
                    li.textContent += ' ✓';
                }
                li.addEventListener('click', () => {
                    playEpisode(episode);
                });
                episodesList.appendChild(li);
            });
            seasonContainer.appendChild(episodesList);
            fragment.appendChild(seasonContainer);
        });
        seriesModalContent.appendChild(fragment);
    };

    const closeSeriesModal = () => {
        seriesInfoModal.classList.add('hidden');
        seriesModalContent.innerHTML = '';
    };

    // --- LÓGICA DO PLAYER ---
    const handleItemClick = (item) => {
        // Rota modificada para séries
        if (state.currentSection === 'series') {
            showSeriesInfo(item);
            return;
        }

        const streamId = item.stream_id;
        const extension = item.container_extension || 'mp4';
        
        playStream(streamId, extension, state.currentSection);
    };

    const playEpisode = (episode) => {
        closeSeriesModal();
        // O player precisa saber que o item atual é um episódio de série para marcar como visto.
        state.currentStream = { ...episode, type: 'series' };
        playStream(episode.id, episode.container_extension, 'series');
    };
    
    const playStream = (streamId, extension, type) => {
        stopPlayer(); // Para garantir que players anteriores sejam destruídos
        mainScreen.classList.add('hidden');
        playerScreen.classList.remove('hidden');
        showLoading(true);

        const { username, password } = state.userInfo;
        const host = hostInput.value.trim();
        let streamUrl;

        switch(type) {
            case 'live':
                streamUrl = `${host}/live/${username}/${password}/${streamId}.m3u8`;
                break;
            case 'movie':
                streamUrl = `${host}/movie/${username}/${password}/${streamId}.${extension}`;
                break;
            case 'series':
                streamUrl = `${host}/series/${username}/${password}/${streamId}.${extension}`;
                break;
        }
        
        // Se o item não for um episódio, guarde-o no estado
        if (type !== 'series') {
            state.currentStream = state.currentContent.find(c => c.stream_id === streamId);
        }

        if (streamUrl.includes('.m3u8')) {
            if (Hls.isSupported()) {
                state.hls = new Hls();
                state.hls.loadSource(streamUrl);
                state.hls.attachMedia(videoPlayer);
                state.hls.on(Hls.Events.MANIFEST_PARSED, () => { videoPlayer.play(); showLoading(false); });
                state.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('Erro fatal no HLS:', data);
                        showLoading(false);
                        alert("Não foi possível carregar o stream.");
                        closePlayer();
                    }
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                videoPlayer.src = streamUrl;
                videoPlayer.addEventListener('loadedmetadata', () => { videoPlayer.play(); showLoading(false); });
            }
        } else {
            videoPlayer.src = streamUrl;
            videoPlayer.play().catch(e => console.error("Erro ao reproduzir:", e));
            showLoading(false);
        }
        playerScreen.focus();
    };

    const stopPlayer = () => {
        if (state.hls) {
            state.hls.destroy();
            state.hls = null;
        }
        videoPlayer.pause();
        videoPlayer.removeAttribute('src');
        videoPlayer.load();
    };
    
    const closePlayer = () => {
        // NOVO: Marca o episódio como visto ao fechar o player
        if (state.currentStream && state.currentStream.type === 'series') {
            markAsWatched(state.currentStream.id);
        }
        stopPlayer();
        state.currentStream = null; // Limpa o stream atual
        playerScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        renderItems(state.currentContent);
    };
    
    const handlePlayerKeys = (e) => {
        e.preventDefault();
        switch (e.key) {
            case ' ': videoPlayer.paused ? (videoPlayer.play(), showFeedback('▶')) : (videoPlayer.pause(), showFeedback('❚❚')); break;
            case 'ArrowRight': videoPlayer.currentTime += 10; showFeedback('» +10s'); break;
            case 'ArrowLeft': videoPlayer.currentTime -= 10; showFeedback('« -10s'); break;
            case 't': case 'T': window.electronAPI.toggleFullscreen(); break;
            case 'f': case 'F':
                // Favoritar não se aplica a episódios individuais desta forma.
                if (state.currentSection !== 'series') {
                    toggleFavorite(state.currentStream);
                    showFeedback(isFavorite(state.currentStream) ? '⭐ Adicionado' : '⭐ Removido');
                }
                break;
            case 'Escape': closePlayer(); break;
        }
    };
    
    let feedbackTimeout;
    const showFeedback = (text) => {
        clearTimeout(feedbackTimeout);
        playerFeedback.textContent = text;
        playerFeedback.style.opacity = '1';
        feedbackTimeout = setTimeout(() => { playerFeedback.style.opacity = '0'; }, 1000);
    };

    // --- LÓGICA DE FAVORITOS E VISTOS ---
    const markAsWatched = (episodeId) => {
        if (!state.watched.includes(episodeId)) {
            state.watched.push(episodeId);
            localStorage.setItem('iptv_watched', JSON.stringify(state.watched));
        }
    };

    const isFavorite = (item) => {
        if (!item) return false;
        const id = item.stream_id || item.series_id;
        const type = state.currentSection;
        return state.favorites[type] && state.favorites[type].includes(id);
    };
    
    const showFavorites = async () => {
        showLoading(true);
        state.currentCategory = 'favorites';
        updateActiveCategoryUI();
        const { username, password } = state.userInfo;
        const favIds = state.favorites[state.currentSection] || [];
        if (favIds.length === 0) {
            renderItems([]);
            showLoading(false);
            return;
        }
        const actionMap = {
            live: 'get_live_streams',
            movie: 'get_vod_streams',
        };
        const params = { username, password, action: actionMap[state.currentSection] };
        try {
            const res = await state.api.get('/player_api.php', { params });
            const allItems = res.data || [];
            const favoriteItems = allItems.filter(item => favIds.includes(item.stream_id || item.series_id));
            state.currentContent = favoriteItems;
            renderItems(favoriteItems);
        } catch (error) {
            console.error('Erro ao buscar favoritos:', error);
        } finally {
            showLoading(false);
        }
    };
    
    const toggleFavorite = (item) => {
        if (!item) return;
        const id = item.stream_id || item.series_id;
        const type = state.currentSection;
        if (!state.favorites[type]) state.favorites[type] = [];

        const index = state.favorites[type].indexOf(id);
        if (index > -1) {
            state.favorites[type].splice(index, 1);
        } else {
            state.favorites[type].push(id);
        }
        localStorage.setItem('iptv_favorites', JSON.stringify(state.favorites));

        if (state.currentCategory === 'favorites' && playerScreen.classList.contains('hidden')) {
            showFavorites();
        }
    };
    
    const showLoading = (show) => {
        loadingSpinner.classList.toggle('hidden', !show);
    };

    // --- EVENT LISTENERS ---
    
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    navBtns.forEach(btn => btn.addEventListener('click', (e) => handleSectionChange(e)));
    searchBox.addEventListener('input', handleSearch);
    backToMainBtn.addEventListener('click', closePlayer);
    playerScreen.addEventListener('keydown', handlePlayerKeys);
    // NOVOS Listeners
    closeSeriesModalBtn.addEventListener('click', closeSeriesModal);
    
    window.addEventListener('keydown', (e) => {
        if (e.key === ' ' && e.target === document.body) e.preventDefault();
        // Fecha o modal de séries com a tecla Escape
        if (e.key === 'Escape' && !seriesInfoModal.classList.contains('hidden')) {
            closeSeriesModal();
        }
    });

    // Inicia a aplicação
    autoLogin();
});