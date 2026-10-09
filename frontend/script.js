
"use strict";

// ============================================================
// ANIME PLATFORM - FRONTEND SCRIPT
// ============================================================

console.log("Anime Platform script loaded.");

document.addEventListener("DOMContentLoaded", () => {
    console.log("Starting login check...");

    // ========================================================
    // ELEMENTS
    // ========================================================

    const loginPage = document.getElementById("loginPage");
    const dashboard = document.getElementById("dashboard");

    const discordLogin = document.getElementById("discordLogin");
    const googleLogin = document.getElementById("googleLogin");
    const status = document.getElementById("status");

    const premiumButton = document.getElementById("premiumButton");
    const animGems = document.getElementById("animGems");

    const profileButton = document.getElementById("profileButton");
    const navAvatar = document.getElementById("navAvatar");
    const navDisplayName = document.getElementById("navDisplayName");
    const welcomeName = document.getElementById("welcomeName");
    const verifiedBadge = document.getElementById("verifiedBadge");

    const browseAnime = document.getElementById("browseAnime");
    const animeSearch = document.getElementById("animeSearch");
    const clearSearch = document.getElementById("clearSearch");
    const animeGrid = document.getElementById("animeGrid");
    const animeSectionTitle = document.getElementById("animeSectionTitle");
    const animeCount = document.getElementById("animeCount");
    const noAnime = document.getElementById("noAnime");

    const featureGems = document.getElementById("featureGems");
    const platformPremiumCard = document.getElementById("platformPremiumCard");

    // Profile
    const profilePanel = document.getElementById("profilePanel");
    const closeProfile = document.getElementById("closeProfile");
    const profileAvatar = document.getElementById("profileAvatar");
    const profileName = document.getElementById("profileName");
    const profileVerifiedBadge = document.getElementById("profileVerifiedBadge");
    const profileUsername = document.getElementById("profileUsername");
    const profileGems = document.getElementById("profileGems");
    const profilePremium = document.getElementById("profilePremium");
    const profileVerified = document.getElementById("profileVerified");
    const openPremiumFromProfile = document.getElementById("openPremiumFromProfile");
    const logout = document.getElementById("logout");

    // Premium modal
    const premiumModal = document.getElementById("premiumModal");
    const closePremiumModal = document.getElementById("closePremiumModal");
    const premiumStatusText = document.getElementById("premiumStatusText");
    const premiumStatusBadge = document.getElementById("premiumStatusBadge");
    const premiumPlans = document.getElementById("premiumPlans");
    const premiumMessage = document.getElementById("premiumMessage");

    // Anime modal
    const animeModal = document.getElementById("animeModal");
    const closeAnimeModal = document.getElementById("closeAnimeModal");
    const detailPoster = document.getElementById("detailPoster");
    const detailTitle = document.getElementById("detailTitle");
    const detailGenre = document.getElementById("detailGenre");
    const detailRating = document.getElementById("detailRating");
    const detailDescription = document.getElementById("detailDescription");
    const episodeList = document.getElementById("episodeList");

    // ========================================================
    // DATA
    // ========================================================

    let currentUser = null;
    let currentSaveData = null;
    let premiumData = null;
    let currentGuild = null;

    const GUILD_CREATE_COST = 1000;

    const animeList = [
        {
            id: 1,
            title: "Mayonaka Heart Tune",
            genre: "Romance • Comedy",
            rating: "7.3",
            description:
                "Kisah Arisu Yamabuki yang mencari pemilik suara Apollo dan bertemu empat gadis yang mengejar impian mereka dalam bidang suara.",
            poster:
                "mayonaka-heart-tune.jpg",
            episodes: 12
        },
        
    ];

    // ========================================================
    // HELPERS
    // ========================================================

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function escapeAttribute(value) {
        return escapeHtml(value);
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            credentials: "include",
            ...options,
            headers: {
                ...(options.headers || {})
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Server returned an invalid response.");
        }

        if (!response.ok || data.success === false) {
            throw new Error(
                data.error ||
                data.message ||
                `Request failed (${response.status}).`
            );
        }

        return data;
    }

    // ========================================================
    // LOGIN
    // ========================================================

    if (discordLogin) {
        discordLogin.addEventListener("click", () => {
            window.location.href = "/auth/discord";
        });
    }

    if (googleLogin) {
        googleLogin.addEventListener("click", () => {
            window.location.href = "/auth/google";
        });
    }

    async function checkLogin() {
        try {
            const response = await fetch("/api/me", {
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error("Failed to check login.");
            }

            const data = await response.json();

            if (!data.loggedIn) {
                showLogin();
                return;
            }

            currentUser = data.user;

            currentSaveData = data.saveData || {
                animGems: 0,
                premiumUntil: null,
                verifiedBadge: false
            };

            showDashboard();
            updateUserUI();

            await loadPremiumStatus();
            renderAnime(animeList);

        } catch (error) {
            console.error("Login check error:", error);
            showLogin();

            if (status) {
                status.textContent = "Unable to check login.";
            }
        }
    }

    function showLogin() {
        if (loginPage) loginPage.style.display = "flex";
        if (dashboard) dashboard.style.display = "none";
    }

    function showDashboard() {
        if (loginPage) loginPage.style.display = "none";
        if (dashboard) dashboard.style.display = "block";
    }

    async function refreshUserData() {
        const data = await apiRequest("/api/me");

        if (data.loggedIn) {
            currentUser = data.user;
            currentSaveData = data.saveData || currentSaveData || {};
            updateUserUI();
        }

        return data;
    }

    // ========================================================
    // UPDATE USER UI
    // ========================================================

    function updateUserUI() {
        if (!currentUser) return;

        const displayName =
            currentUser.displayName ||
            currentUser.display_name ||
            currentUser.username ||
            "User";

        const username = currentUser.username || "user";

        const avatar =
            currentUser.avatar ||
            currentUser.avatar_url ||
            "https://cdn.discordapp.com/embed/avatars/0.png";

        const gems = Number(currentSaveData?.animGems || 0);
        const verified = Boolean(currentSaveData?.verifiedBadge);

        if (navAvatar) navAvatar.src = avatar;
        if (navDisplayName) navDisplayName.textContent = displayName;
        if (welcomeName) welcomeName.textContent = displayName;

        if (animGems) {
            animGems.textContent = gems.toLocaleString("id-ID");
        }

        if (featureGems) {
            featureGems.textContent = gems.toLocaleString("id-ID");
        }

        updateVerifiedBadge(verified);

        if (profileAvatar) profileAvatar.src = avatar;
        if (profileName) profileName.textContent = displayName;

        if (profileUsername) {
            profileUsername.textContent = `@${username}`;
        }

        if (profileGems) {
            profileGems.textContent = gems.toLocaleString("id-ID");
        }

        if (profileVerified) {
            profileVerified.textContent = verified
                ? "Verified"
                : "Not Verified";
        }

        if (profileVerifiedBadge) {
            profileVerifiedBadge.style.display = verified
                ? "inline-flex"
                : "none";
        }

        updateProfilePremium();
    }

    function updateVerifiedBadge(verified) {
        if (!verifiedBadge) return;

        verifiedBadge.style.display = verified
            ? "inline-flex"
            : "none";
    }

    // ========================================================
    // PREMIUM
    // ========================================================

    async function loadPremiumStatus() {
        try {
            const data = await apiRequest("/api/premium/status");

            if (!data.success) return;

            premiumData = data.premium || {
                active: false,
                premium_until: null,
                verified_badge: false
            };

            currentSaveData = {
                ...currentSaveData,
                animGems: Number(
                    data.anim_gems ?? currentSaveData?.animGems ?? 0
                ),
                premiumUntil: premiumData.premium_until || null,
                verifiedBadge: Boolean(premiumData.verified_badge)
            };

            updateUserUI();
            updatePremiumModalStatus();

        } catch (error) {
            console.error("Failed to load Premium status:", error);
        }
    }

    function updateProfilePremium() {
        if (!profilePremium) return;

        const active = Boolean(premiumData?.active);

        if (!active) {
            profilePremium.textContent = "Tidak aktif";
            return;
        }

        const until = premiumData?.premium_until ||
            currentSaveData?.premiumUntil;

        if (until) {
            const date = new Date(until);

            if (!Number.isNaN(date.getTime())) {
                profilePremium.textContent =
                    `Aktif hingga ${date.toLocaleDateString("id-ID")}`;
                return;
            }
        }

        profilePremium.textContent = "Aktif";
    }

    if (profileButton) {
        profileButton.addEventListener("click", () => {
            profilePanel?.classList.add("open");
        });
    }

    if (closeProfile) {
        closeProfile.addEventListener("click", () => {
            profilePanel?.classList.remove("open");
        });
    }

    if (premiumButton) {
        premiumButton.addEventListener("click", openPremiumModal);
    }

    if (platformPremiumCard) {
        platformPremiumCard.addEventListener("click", openPremiumModal);
    }

    if (openPremiumFromProfile) {
        openPremiumFromProfile.addEventListener("click", () => {
            profilePanel?.classList.remove("open");
            openPremiumModal();
        });
    }

    async function openPremiumModal() {
        if (!premiumModal) {
            console.error("premiumModal not found.");
            return;
        }

        premiumModal.classList.add("open");
        await loadPremiumPlans();
    }

    if (closePremiumModal) {
        closePremiumModal.addEventListener("click", () => {
            premiumModal?.classList.remove("open");
        });
    }

    function updatePremiumModalStatus() {
        if (!premiumStatusText || !premiumStatusBadge) return;

        const active = Boolean(premiumData?.active);

        if (active) {
            premiumStatusText.textContent = "Premium Active";
            premiumStatusBadge.textContent = "Active";
            premiumStatusBadge.classList.add("active");

            const until = premiumData?.premium_until;

            if (until) {
                const date = new Date(until);

                if (!Number.isNaN(date.getTime())) {
                    premiumStatusText.textContent =
                        `Active until ${date.toLocaleDateString("id-ID")}`;
                }
            }
        } else {
            premiumStatusText.textContent = "Premium tidak aktif";
            premiumStatusBadge.textContent = "Inactive";
            premiumStatusBadge.classList.remove("active");
        }
    }

    async function loadPremiumPlans() {
        if (!premiumPlans) return;

        premiumPlans.innerHTML = `
            <div class="premium-loading">Loading Premium plans...</div>
        `;

        if (premiumMessage) premiumMessage.textContent = "";

        try {
            const data = await apiRequest("/api/premium/plans");

            if (!Array.isArray(data.plans)) {
                throw new Error("Invalid Premium plan data.");
            }

            renderPremiumPlans(data.plans);

        } catch (error) {
            console.error("Premium plans error:", error);

            premiumPlans.innerHTML = `
                <div class="premium-loading">
                    Failed to load Premium plans.
                </div>
            `;

            if (premiumMessage) {
                premiumMessage.textContent =
                    "Premium plans could not be loaded.";
            }
        }
    }

    function renderPremiumPlans(plans) {
        if (!premiumPlans) return;

        premiumPlans.innerHTML = "";

        plans.forEach((plan) => {
            const duration = Number(plan.duration_days || 0);
            const price = Number(plan.price_idr || 0);
            const bonus = Number(plan.bonus_anim_gems || 0);
            const isBest = Boolean(plan.is_best_value);

            const card = document.createElement("div");
            card.className = `premium-plan${isBest ? " best-value" : ""}`;

            card.innerHTML = `
                ${isBest ? `<div class="best-value-label">BEST VALUE</div>` : ""}

                <div class="premium-plan-top">
                    <div>
                        <div class="premium-plan-label">
                            ${escapeHtml(plan.name || "Premium")}
                        </div>
                        <div class="premium-duration">${duration} Days</div>
                    </div>
                    <div class="premium-price">
                        Rp${price.toLocaleString("id-ID")}
                    </div>
                </div>

                <div class="premium-bonus">
                    💎 ${bonus.toLocaleString("id-ID")} AnimGems
                </div>

                <div class="premium-benefits">
                    <div>✓ Premium access</div>
                    <div>✓ Verified Badge</div>
                    <div>✓ ${bonus.toLocaleString("id-ID")} AnimGems</div>
                </div>

                <button type="button" class="premium-buy-button">
                    Buy Premium
                </button>
            `;

            card.querySelector(".premium-buy-button")
                ?.addEventListener("click", () => {
                    handlePremiumPurchase(plan);
                });

            premiumPlans.appendChild(card);
        });
    }

    function handlePremiumPurchase(plan) {
        console.log("Premium purchase selected:", plan);

        if (premiumMessage) {
            premiumMessage.textContent =
                "Payment system belum diaktifkan. Premium belum dibeli.";
        }
    }

    // ========================================================
    // BROWSE AND SEARCH ANIME
    // ========================================================

    if (browseAnime) {
        browseAnime.addEventListener("click", () => {
            const animeSection = animeGrid?.closest(".content-section");

            animeSection?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }

    if (animeSearch) {
        animeSearch.addEventListener("input", () => {
            filterAnime(animeSearch.value);
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener("click", () => {
            if (animeSearch) {
                animeSearch.value = "";
                filterAnime("");
                animeSearch.focus();
            }
        });
    }

    function filterAnime(searchTerm) {
        const search = String(searchTerm || "").trim().toLowerCase();

        if (!search) {
            renderAnime(animeList);
            return;
        }

        const filtered = animeList.filter((anime) =>
            anime.title.toLowerCase().includes(search) ||
            anime.genre.toLowerCase().includes(search)
        );

        renderAnime(filtered);
    }

    function renderAnime(list) {
        if (!animeGrid) return;

        animeGrid.innerHTML = "";

        const animeArray = Array.isArray(list) ? list : [];

        if (animeCount) {
            animeCount.textContent = `${animeArray.length} Anime`;
        }

        if (animeSectionTitle) {
            animeSectionTitle.textContent =
                animeSearch?.value.trim() ? "Search Results" : "Anime";
        }

        if (animeArray.length === 0) {
            if (noAnime) noAnime.style.display = "block";
            return;
        }

        if (noAnime) noAnime.style.display = "none";

        animeArray.forEach((anime) => {
            const card = document.createElement("article");
            card.className = "anime-card";

            card.innerHTML = `
                <div class="anime-poster">
                    <img
                        src="${escapeAttribute(anime.poster)}"
                        alt="${escapeAttribute(anime.title)}"
                        loading="lazy"
                    >
                    <span class="anime-rating">
                        ★ ${escapeHtml(anime.rating || "-")}
                    </span>
                </div>

                <div class="anime-card-info">
                    <h3>${escapeHtml(anime.title)}</h3>
                    <p>${escapeHtml(anime.genre)}</p>
                </div>
            `;

            card.addEventListener("click", () => {
                openAnimeModal(anime);
            });

            animeGrid.appendChild(card);
        });
    }

    // ========================================================
    // ANIME DETAILS AND UPLOADED EPISODES
    // ========================================================

    async function openAnimeModal(anime) {
        if (!animeModal) return;

        if (detailPoster) detailPoster.src = anime.poster || "";
        if (detailTitle) detailTitle.textContent = anime.title || "Anime";
        if (detailGenre) detailGenre.textContent = anime.genre || "";

        if (detailRating) {
            detailRating.textContent = anime.rating
                ? `★ ${anime.rating}`
                : "";
        }

        if (detailDescription) {
            detailDescription.textContent = anime.description || "";
        }

        animeModal.classList.add("open");

        if (!episodeList) return;

        episodeList.replaceChildren();

        const loading = document.createElement("p");
        loading.textContent = "Memuatkan episod...";
        episodeList.appendChild(loading);

        try {
            const response = await fetch("/api/episodes", {
                credentials: "include"
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.error || "Gagal memuatkan episod."
                );
            }

            const episodes = (data.episodes || []).filter((episode) => {
                return String(episode.animeTitle || "").trim().toLowerCase()
                    === String(anime.title || "").trim().toLowerCase();
            });

            episodeList.replaceChildren();

            if (episodes.length === 0) {
                const message = document.createElement("p");

                message.textContent =
                    "Belum ada episod untuk anime ini. Pastikan nama anime semasa upload sama dengan nama di halaman utama.";

                episodeList.appendChild(message);
                return;
            }

            episodes.forEach((episode, index) => {
                const button = document.createElement("button");

                button.type = "button";
                button.className = "episode-button";
                button.textContent =
                    episode.title || `Episode ${index + 1}`;

                button.addEventListener("click", () => {
                    window.location.href =
                        "/watch.html?id=" +
                        encodeURIComponent(episode.id);
                });

                episodeList.appendChild(button);
            });

        } catch (error) {
            console.error("Load anime episodes error:", error);

            episodeList.replaceChildren();

            const message = document.createElement("p");
            message.textContent =
                "Gagal memuatkan episod: " + error.message;

            episodeList.appendChild(message);
        }
    }

    if (closeAnimeModal) {
        closeAnimeModal.addEventListener("click", () => {
            animeModal?.classList.remove("open");
        });
    }

    if (premiumModal) {
        premiumModal.addEventListener("click", (event) => {
            if (event.target === premiumModal) {
                premiumModal.classList.remove("open");
            }
        });
    }

    if (animeModal) {
        animeModal.addEventListener("click", (event) => {
            if (event.target === animeModal) {
                animeModal.classList.remove("open");
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        profilePanel?.classList.remove("open");
        premiumModal?.classList.remove("open");
        animeModal?.classList.remove("open");
        document.getElementById("guildModal")?.classList.remove("open");
    });

    // ========================================================
    // LOGOUT
    // ========================================================

    if (logout) {
        logout.addEventListener("click", async () => {
            try {
                const response = await fetch("/auth/logout", {
                    method: "POST",
                    credentials: "include"
                });

                if (!response.ok) {
                    throw new Error("Logout failed.");
                }

                window.location.href = "/";

            } catch (error) {
                console.error("Logout error:", error);
                window.location.href = "/auth/logout";
            }
        });
    }

    // ========================================================
    // GUILD SYSTEM
    // ========================================================

    const guildFeatureCard =
        document.getElementById("guildFeatureCard") ||
        document.querySelector(".feature-card:nth-child(3)");

    if (guildFeatureCard) {
        guildFeatureCard.style.cursor = "pointer";

        guildFeatureCard.addEventListener("click", (event) => {
            if (event.target.closest("a, button")) return;
            openGuildPanel();
        });
    } else {
        console.warn("Guild feature card not found.");
    }

    // --------------------------------------------------------
    // GUILD MODAL
    // --------------------------------------------------------

    function createGuildModal() {
        if (document.getElementById("guildModal")) return;

        const modal = document.createElement("div");

        modal.id = "guildModal";
        modal.className = "modal";

        modal.innerHTML = `
            <div class="modal-content guild-modal-content">
                <button
                    type="button"
                    id="closeGuildModal"
                    class="modal-close"
                    aria-label="Close Guild"
                >×</button>

                <div class="premium-header">
                    <div class="premium-crown">🏰</div>
                    <h2>Guild</h2>
                    <p>Create or join a Guild and play together.</p>
                </div>

                <div id="guildContent">
                    <div class="premium-loading">Loading Guild...</div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector("#closeGuildModal")
            ?.addEventListener("click", () => {
                modal.classList.remove("open");
            });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.classList.remove("open");
            }
        });
    }

    async function openGuildPanel() {
        createGuildModal();

        const modal = document.getElementById("guildModal");

        if (!modal) return;

        modal.classList.add("open");
        await loadMyGuild();
    }

    // --------------------------------------------------------
    // LOAD MY GUILD
    // --------------------------------------------------------

    async function loadMyGuild() {
        const content = document.getElementById("guildContent");

        if (!content) return;

        content.innerHTML = `
            <div class="premium-loading">Loading Guild...</div>
        `;

        try {
            const data = await apiRequest("/api/guilds/mine");

            currentGuild = data.guild || null;

            if (currentGuild) {
                renderMyGuild(currentGuild);
            } else {
                renderNoGuild();
            }

        } catch (error) {
            console.error("Load Guild error:", error);

            content.innerHTML = `
                <div class="empty-state">
                    <h3>Failed to load Guild</h3>
                    <p>${escapeHtml(error.message)}</p>
                    <button type="button" id="retryGuildButton"
                        class="primary-button">Retry</button>
                </div>
            `;

            content.querySelector("#retryGuildButton")
                ?.addEventListener("click", loadMyGuild);
        }
    }

    // --------------------------------------------------------
    // NO GUILD
    // --------------------------------------------------------

    function renderNoGuild() {
        const content = document.getElementById("guildContent");

        if (!content) return;

        currentGuild = null;

        content.innerHTML = `
            <div style="text-align:center;padding:20px 10px;">
                <div style="font-size:60px;margin-bottom:10px;">🏰</div>

                <h3>You are not in a Guild</h3>

                <p style="opacity:.7;margin-bottom:20px;">
                    Create your own Guild or join an existing one.
                </p>

                <div style="
                    display:flex;
                    gap:10px;
                    flex-wrap:wrap;
                    justify-content:center;
                ">
                    <button type="button" id="createGuildButton"
                        class="primary-button">Create Guild</button>

                    <button type="button" id="browseGuildButton"
                        class="primary-button">Browse Guilds</button>
                </div>

                <p style="margin-top:18px;opacity:.7;font-size:14px;">
                    Creating a Guild costs
                    <strong>💎 ${GUILD_CREATE_COST.toLocaleString("id-ID")} AnimGems</strong>
                </p>
            </div>
        `;

        content.querySelector("#createGuildButton")
            ?.addEventListener("click", openCreateGuildForm);

        content.querySelector("#browseGuildButton")
            ?.addEventListener("click", loadGuildList);
    }

    // --------------------------------------------------------
    // CREATE GUILD FORM
    // --------------------------------------------------------

    function openCreateGuildForm() {
        const content = document.getElementById("guildContent");

        if (!content) return;

        const gems = Number(currentSaveData?.animGems || 0);

        content.innerHTML = `
            <div>
                <h3>Create Guild</h3>

                <p style="opacity:.7;margin-bottom:18px;">
                    Cost:
                    <strong>💎 ${GUILD_CREATE_COST.toLocaleString("id-ID")} AnimGems</strong>
                </p>

                <label for="guildNameInput"
                    style="display:block;margin-bottom:6px;">
                    Guild Name
                </label>

                <input
                    id="guildNameInput"
                    type="text"
                    maxlength="50"
                    minlength="2"
                    placeholder="Enter Guild name..."
                    style="
                        width:100%;
                        box-sizing:border-box;
                        padding:12px;
                        border-radius:10px;
                        border:1px solid var(--viz-border,#444);
                        margin-bottom:14px;
                    "
                >

                <label for="guildDescriptionInput"
                    style="display:block;margin-bottom:6px;">
                    Description
                </label>

                <textarea
                    id="guildDescriptionInput"
                    maxlength="255"
                    placeholder="Describe your Guild..."
                    style="
                        width:100%;
                        min-height:90px;
                        box-sizing:border-box;
                        padding:12px;
                        border-radius:10px;
                        border:1px solid var(--viz-border,#444);
                        resize:vertical;
                        margin-bottom:14px;
                    "
                ></textarea>

                <p style="font-size:13px;opacity:.7;margin-bottom:16px;">
                    Your AnimGems: 💎 ${gems.toLocaleString("id-ID")}
                </p>

                <div id="createGuildMessage"
                    role="status"
                    style="margin-bottom:12px;min-height:20px;">
                </div>

                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button type="button" id="submitCreateGuild"
                        class="primary-button">Create Guild</button>

                    <button type="button" id="backGuildButton"
                        class="logout-button">Back</button>
                </div>
            </div>
        `;

        content.querySelector("#submitCreateGuild")
            ?.addEventListener("click", createGuild);

        content.querySelector("#backGuildButton")
            ?.addEventListener("click", renderNoGuild);

        content.querySelector("#guildNameInput")?.focus();
    }

    // --------------------------------------------------------
    // CREATE GUILD
    // --------------------------------------------------------

    async function createGuild() {
        const nameInput = document.getElementById("guildNameInput");
        const descriptionInput = document.getElementById("guildDescriptionInput");
        const message = document.getElementById("createGuildMessage");
        const button = document.getElementById("submitCreateGuild");

        const name = nameInput?.value.trim() || "";
        const description = descriptionInput?.value.trim() || "";

        if (name.length < 2 || name.length > 50) {
            if (message) {
                message.textContent =
                    "Guild name must be between 2 and 50 characters.";
            }
            return;
        }

        if (description.length > 255) {
            if (message) {
                message.textContent =
                    "Description cannot exceed 255 characters.";
            }
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Creating...";
        }

        if (message) message.textContent = "";

        try {
            await apiRequest("/api/guilds", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name, description })
            });

            try {
                await refreshUserData();
            } catch (refreshError) {
                console.warn("Could not refresh user data:", refreshError);
            }

            await loadMyGuild();

        } catch (error) {
            console.error("Create Guild error:", error);

            if (message) {
                message.textContent = error.message;
            }

            if (button) {
                button.disabled = false;
                button.textContent = "Create Guild";
            }
        }
    }

    // --------------------------------------------------------
    // RENDER MY GUILD
    // --------------------------------------------------------

    function renderMyGuild(guild) {
        const content = document.getElementById("guildContent");

        if (!content) return;

        const role = String(guild.role || "member").toLowerCase();
        const isOwner = role === "owner";
        const isAdmin = role === "admin";

        content.innerHTML = `
            <div>
                <div style="
                    display:flex;
                    gap:14px;
                    align-items:center;
                    margin-bottom:20px;
                ">
                    <div style="
                        width:64px;
                        height:64px;
                        flex-shrink:0;
                        border-radius:16px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        background:rgba(255,255,255,.08);
                        font-size:32px;
                        overflow:hidden;
                    ">
                        ${
                            guild.icon_url
                                ? `<img
                                    src="${escapeAttribute(guild.icon_url)}"
                                    alt="Guild icon"
                                    style="width:100%;height:100%;object-fit:cover;"
                                >`
                                : "🏰"
                        }
                    </div>

                    <div style="min-width:0;">
                        <h3 style="margin:0;overflow-wrap:anywhere;">
                            ${escapeHtml(guild.name)}
                        </h3>

                        <p style="margin:4px 0 0;opacity:.7;overflow-wrap:anywhere;">
                            ${escapeHtml(guild.description || "No description.")}
                        </p>
                    </div>
                </div>

                <div style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
                    gap:10px;
                    margin-bottom:20px;
                ">
                    <div class="profile-info-item">
                        <span>Level</span>
                        <strong>${Number(guild.level || 1)}</strong>
                    </div>

                    <div class="profile-info-item">
                        <span>XP</span>
                        <strong>${Number(guild.xp || 0).toLocaleString("id-ID")}</strong>
                    </div>

                    <div class="profile-info-item">
                        <span>Treasury</span>
                        <strong>💎 ${Number(guild.treasury || 0).toLocaleString("id-ID")}</strong>
                    </div>

                    <div class="profile-info-item">
                        <span>Role</span>
                        <strong>${escapeHtml(role)}</strong>
                    </div>
                </div>

                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button type="button" id="guildMembersButton"
                        class="primary-button">Members</button>

                    <button type="button" id="guildChatButton"
                        class="primary-button">Guild Chat</button>

                    ${
                        !isOwner
                            ? `<button type="button" id="leaveGuildButton"
                                class="logout-button">Leave Guild</button>`
                            : `<button type="button" id="deleteGuildButton"
                                class="logout-button"
                                style="background:#dc2626;color:white;border:none;">
                                Delete Guild
                            </button>`
                    }
                </div>

                ${
                    isOwner || isAdmin
                        ? `<p style="margin-top:18px;opacity:.6;font-size:13px;">
                            You have Guild management permissions.
                        </p>`
                        : ""
                }
            </div>
        `;

        content.querySelector("#guildMembersButton")
            ?.addEventListener("click", () => loadGuildDetails(guild.id));

        content.querySelector("#guildChatButton")
            ?.addEventListener("click", () => {
                alert(
                    "Guild Chat belum tersedia. Ia memerlukan sistem chat dan endpoint backend."
                );
            });

        content.querySelector("#leaveGuildButton")
            ?.addEventListener("click", () => leaveGuild(guild.id));

        content.querySelector("#deleteGuildButton")
            ?.addEventListener("click", () => deleteGuild(guild.id));
    }

    // --------------------------------------------------------
    // DELETE GUILD (OWNER ONLY)
    // --------------------------------------------------------

    async function deleteGuild(guildId) {
        const confirmed = window.confirm(
            "AMARAN: Adakah kau pasti mahu memadam Guild ini?\n\n" +
            "Semua ahli akan dikeluarkan dan tindakan ini tidak boleh dibatalkan."
        );

        if (!confirmed) return;

        const button = document.getElementById("deleteGuildButton");

        if (button) {
            button.disabled = true;
            button.textContent = "Deleting...";
        }

        try {
            const data = await apiRequest(
                `/api/guilds/${encodeURIComponent(guildId)}`,
                {
                    method: "DELETE"
                }
            );

            currentGuild = null;

            alert(data.message || "Guild berjaya dipadam.");

            await loadMyGuild();

        } catch (error) {
            console.error("Delete Guild error:", error);

            alert(error.message || "Guild gagal dipadam.");

            if (button) {
                button.disabled = false;
                button.textContent = "Delete Guild";
            }
        }
    }

    // --------------------------------------------------------
    // BROWSE GUILDS
    // --------------------------------------------------------

    async function loadGuildList() {
        const content = document.getElementById("guildContent");

        if (!content) return;

        content.innerHTML = `
            <div class="premium-loading">Loading Guilds...</div>
        `;

        try {
            const data = await apiRequest("/api/guilds");
            const guilds = Array.isArray(data.guilds) ? data.guilds : [];

            if (guilds.length === 0) {
                content.innerHTML = `
                    <div class="empty-state">
                        <h3>No Guilds yet</h3>
                        <p>Be the first to create one.</p>

                        <button type="button" id="createFirstGuild"
                            class="primary-button">Create Guild</button>

                        <button type="button" id="backNoGuild"
                            class="logout-button">Back</button>
                    </div>
                `;

                content.querySelector("#createFirstGuild")
                    ?.addEventListener("click", openCreateGuildForm);

                content.querySelector("#backNoGuild")
                    ?.addEventListener("click", renderNoGuild);

                return;
            }

            content.innerHTML = `
                <div>
                    <div style="
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        gap:10px;
                    ">
                        <h3>Browse Guilds</h3>
                        <button type="button" id="backGuildList"
                            class="logout-button">Back</button>
                    </div>

                    <div id="guildList"
                        style="display:grid;gap:10px;margin-top:15px;">
                    </div>
                </div>
            `;

            content.querySelector("#backGuildList")
                ?.addEventListener("click", renderNoGuild);

            const guildList = content.querySelector("#guildList");

            guilds.forEach((guild) => {
                const item = document.createElement("div");

                item.style.cssText = `
                    padding:14px;
                    border:1px solid var(--viz-border,#444);
                    border-radius:12px;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:12px;
                `;

                const details = document.createElement("div");
                details.style.minWidth = "0";

                const title = document.createElement("strong");
                title.textContent = `🏰 ${guild.name || "Guild"}`;

                const description = document.createElement("p");
                description.style.cssText =
                    "margin:4px 0;opacity:.7;font-size:13px;";
                description.textContent =
                    guild.description || "No description.";

                const metadata = document.createElement("small");
                metadata.textContent =
                    `${Number(guild.member_count || 0)} members • Level ${Number(guild.level || 1)}`;

                details.append(title, description, metadata);

                const joinButton = document.createElement("button");
                joinButton.type = "button";
                joinButton.className = "primary-button";
                joinButton.textContent = "Join";

                joinButton.addEventListener("click", async () => {
                    joinButton.disabled = true;
                    joinButton.textContent = "Joining...";

                    try {
                        await joinGuild(guild.id);
                    } finally {
                        if (joinButton.isConnected) {
                            joinButton.disabled = false;
                            joinButton.textContent = "Join";
                        }
                    }
                });

                item.append(details, joinButton);
                guildList.appendChild(item);
            });

        } catch (error) {
            console.error("Guild list error:", error);

            content.innerHTML = `
                <div class="empty-state">
                    <h3>Failed to load Guilds</h3>
                    <p>${escapeHtml(error.message)}</p>

                    <button type="button" id="retryGuildList"
                        class="primary-button">Retry</button>

                    <button type="button" id="backGuildListError"
                        class="logout-button">Back</button>
                </div>
            `;

            content.querySelector("#retryGuildList")
                ?.addEventListener("click", loadGuildList);

            content.querySelector("#backGuildListError")
                ?.addEventListener("click", renderNoGuild);
        }
    }

    // --------------------------------------------------------
    // JOIN GUILD
    // --------------------------------------------------------

    async function joinGuild(guildId) {
        try {
            await apiRequest(
                `/api/guilds/${encodeURIComponent(guildId)}/join`,
                { method: "POST" }
            );

            await loadMyGuild();

        } catch (error) {
            console.error("Join Guild error:", error);
            alert(error.message);
        }
    }

    // --------------------------------------------------------
    // LEAVE GUILD
    // --------------------------------------------------------

    async function leaveGuild(guildId) {
        const confirmed = window.confirm(
            "Are you sure you want to leave this Guild?"
        );

        if (!confirmed) return;

        try {
            await apiRequest(
                `/api/guilds/${encodeURIComponent(guildId)}/leave`,
                { method: "POST" }
            );

            currentGuild = null;
            await loadMyGuild();

        } catch (error) {
            console.error("Leave Guild error:", error);
            alert(error.message);
        }
    }

    // --------------------------------------------------------
    // GUILD DETAILS / MEMBERS
    // --------------------------------------------------------

    async function loadGuildDetails(guildId) {
        const content = document.getElementById("guildContent");

        if (!content) return;

        content.innerHTML = `
            <div class="premium-loading">Loading members...</div>
        `;

        try {
            const data = await apiRequest(
                `/api/guilds/${encodeURIComponent(guildId)}`
            );

            const guild = data.guild;
            const members = Array.isArray(data.members) ? data.members : [];

            content.innerHTML = `
                <div>
                    <button type="button" id="backToGuildButton"
                        class="logout-button" style="margin-bottom:16px;">
                        Back
                    </button>

                    <h3>${escapeHtml(guild.name || "Guild")}</h3>
                    <p style="opacity:.7;">${members.length} member(s)</p>

                    <div id="guildMembersList"
                        style="display:grid;gap:8px;margin-top:15px;">
                    </div>
                </div>
            `;

            content.querySelector("#backToGuildButton")
                ?.addEventListener("click", loadMyGuild);

            const membersList = content.querySelector("#guildMembersList");

            members.forEach((member) => {
                const row = document.createElement("div");

                row.style.cssText = `
                    display:flex;
                    align-items:center;
                    gap:10px;
                    padding:10px;
                    border:1px solid var(--viz-border,#444);
                    border-radius:10px;
                `;

                const avatar = document.createElement("img");
                avatar.src =
                    member.avatar_url ||
                    "https://cdn.discordapp.com/embed/avatars/0.png";
                avatar.alt = "Avatar";
                avatar.style.cssText = `
                    width:40px;
                    height:40px;
                    border-radius:50%;
                    object-fit:cover;
                    flex-shrink:0;
                `;

                const info = document.createElement("div");

                const name = document.createElement("strong");
                name.textContent =
                    member.display_name || member.username || "User";

                const role = document.createElement("div");
                role.style.cssText = "font-size:12px;opacity:.7;";
                role.textContent = member.role || "member";

                info.append(name, role);
                row.append(avatar, info);
                membersList.appendChild(row);
            });

        } catch (error) {
            console.error("Guild details error:", error);

            content.innerHTML = `
                <div class="empty-state">
                    <h3>Failed to load Guild</h3>
                    <p>${escapeHtml(error.message)}</p>

                    <button type="button" id="retryGuildDetails"
                        class="primary-button">Retry</button>

                    <button type="button" id="backGuildDetails"
                        class="logout-button">Back</button>
                </div>
            `;

            content.querySelector("#retryGuildDetails")
                ?.addEventListener("click", () => loadGuildDetails(guildId));

            content.querySelector("#backGuildDetails")
                ?.addEventListener("click", loadMyGuild);
        }
    }

    // ========================================================
    // START
    // ========================================================

    checkLogin();
});
