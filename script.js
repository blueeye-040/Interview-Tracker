// Firebase Configuration
let database = null

async function fetchFirebaseConfig() {
  try {
    const password = prompt("Enter access password:")
    if (!password) {
      console.warn("No password provided. Running in offline mode.")
      return
    }

    const response = await fetch("https://hisehise.pythonanywhere.com/get-firebase-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: password }),
    })

    const data = await response.json()
    console.log("Firebase config response:", data.config)

    const firebaseConfig = data.config
    // Initialize Firebase using the fetched config
    
    firebase.initializeApp(firebaseConfig)
    database = firebase.database()
    console.log("Firebase initialized securely.")
      
    
  } catch (error) {
    console.warn("Error fetching Firebase config:", error)
    console.warn("Running in offline mode.")
  }
}

// Initialize Firebase when the app starts
document.addEventListener("DOMContentLoaded", () => {
  fetchFirebaseConfig()
})

// Application State
class DSATracker {
  constructor() {
    this.currentUser = null
    this.isEditMode = false
    this.editingProblem = null
    this.problemsData = {}
    this.userGoals = {}
    this.currentFilter = {
      search: "",
      topic: "",
      difficulty: "",
      tag: "",
      status: "",
    }

    // Demo users
    this.DEMO_USERS = {
      admin: "admin123",
      user1: "password123",
      demo: "demo123",
    }

    // Initialize after DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init())
    } else {
      this.init()
    }
  }

  init() {
    console.log("Initializing DSA Tracker...")
    try {
      this.setupEventListeners()
      this.checkLoginStatus()
      this.initializeTheme()
    } catch (error) {
      console.error("Error during initialization:", error)
      this.showToast("Error initializing application", "error")
    }
  }

  setupEventListeners() {
    // Login form
    const loginForm = document.getElementById("loginForm")
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => this.handleLogin(e))
    }

    // Add problem form
    const addProblemForm = document.getElementById("addProblemForm")
    if (addProblemForm) {
      addProblemForm.addEventListener("submit", (e) => this.handleAddProblem(e))
    }

    // Import file input
    const importFile = document.getElementById("importFile")
    if (importFile) {
      importFile.addEventListener("change", (e) => this.handleFileImport(e))
    }

    // Modal close on outside click
    const addProblemModal = document.getElementById("addProblemModal")
    if (addProblemModal) {
      addProblemModal.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) this.closeModal()
      })
    }

    const goalsModal = document.getElementById("goalsModal")
    if (goalsModal) {
      goalsModal.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) this.closeGoalsModal()
      })
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeyboardShortcuts(e))

    // Search input with debouncing
    const searchInput = document.getElementById("searchInput")
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this.debounceSearch()
      })
    }
  }

  // Handle file import
  async handleFileImport(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      let data = JSON.parse(text)

      // Handle different data formats
      if (data.users) {
        // Firebase export format: extract problems from users structure
        console.log("Detected Firebase export format")
        const userId = Object.keys(data.users)[0] // Get first user
        if (data.users[userId] && data.users[userId].problems) {
          data = {
            problems: data.users[userId].problems,
            goals: data.users[userId].goals || {},
          }
        } else {
          this.showToast("Invalid Firebase export format", "error")
          return
        }
      } else if (!data.problems) {
        // Direct problems format (legacy)
        console.log("Detected direct problems format")
        data = { problems: data }
      } else {
        // Standard export format
        console.log("Detected standard export format")
      }

      if (!data.problems || Object.keys(data.problems).length === 0) {
        this.showToast("No problems found in file", "error")
        return
      }

      console.log("Problems to import:", Object.keys(data.problems).length, "topics")

      // Show import options modal
      this.showImportOptionsModal(data)
    } catch (error) {
      console.error("Import error:", error)
      this.showToast("Error reading file: " + error.message, "error")
    } finally {
      // Reset file input
      event.target.value = ""
    }
  }

  showImportOptionsModal(data) {
    const modal = document.createElement("div")
    modal.className = "modal show"
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Import Options</h3>
                    <button class="close-btn" onclick="window.app.closeImportModal(this)">&times;</button>
                </div>
                <div style="padding: 1.5rem;">
                    <p>Found <strong>${Object.keys(data.problems).length} topics</strong> with problems to import.</p>
                    <p style="margin: 1rem 0;">Choose how to handle duplicate problems:</p>
                    <div style="margin: 1rem 0;">
                        <label style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                            <input type="radio" name="duplicateAction" value="skip" checked style="margin-right: 0.5rem;">
                            Skip duplicates (recommended)
                        </label>
                        <label style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                            <input type="radio" name="duplicateAction" value="update" style="margin-right: 0.5rem;">
                            Update existing problems
                        </label>
                        <label style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                            <input type="radio" name="duplicateAction" value="create" style="margin-right: 0.5rem;">
                            Create duplicates with suffix
                        </label>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="window.app.closeImportModal(this)">Cancel</button>
                        <button class="btn btn-primary" onclick="window.app.processImport('${btoa(JSON.stringify(data))}')">
                            Start Import
                        </button>
                    </div>
                </div>
            </div>
        `
    document.body.appendChild(modal)
  }

  closeImportModal(element) {
    const modal = element.closest(".modal")
    if (modal) {
      document.body.removeChild(modal)
    }
  }

  async processImport(encodedData) {
    const data = JSON.parse(atob(encodedData))
    const duplicateActionElement = document.querySelector('input[name="duplicateAction"]:checked')
    const duplicateAction = duplicateActionElement ? duplicateActionElement.value : "skip"

    this.closeImportModal(document.querySelector(".modal .close-btn"))

    const loadingOverlay = document.getElementById("loadingOverlay")
    if (loadingOverlay) loadingOverlay.style.display = "flex"

    const importStats = {
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    }

    try {
      // Process each topic
      for (const [topic, problems] of Object.entries(data.problems)) {
        for (const problem of problems) {
          importStats.total++

          try {
            // Check if problem exists
            const existsCheck = await this.checkProblemExists(problem.title, problem.link, topic)

            if (existsCheck.existsByTitle || existsCheck.existsByLink) {
              // Handle duplicate based on user choice
              if (duplicateAction === "skip") {
                importStats.skipped++
                continue
              } else if (duplicateAction === "update") {
                // Update existing problem
                const existingProblem = existsCheck.titleDoc || existsCheck.linkDoc
                const existingTopic = existsCheck.existsByTitle
                  ? topic
                  : Object.keys(this.problemsData).find((t) => this.problemsData[t].includes(existsCheck.linkDoc))

                // Find and update the problem
                const problemIndex = this.problemsData[existingTopic].findIndex(
                  (p) => p.title === existingProblem.title,
                )

                if (problemIndex >= 0) {
                  this.problemsData[existingTopic][problemIndex] = {
                    ...problem,
                    dateAdded: existingProblem.dateAdded || new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                  }
                }

                importStats.updated++
                continue
              } else if (duplicateAction === "create") {
                // Create with suffix
                problem.title += ` (Imported ${new Date().toLocaleDateString()})`
              }
            }

            // Create new problem
            if (!this.problemsData[topic]) {
              this.problemsData[topic] = []
            }

            const newProblem = {
              ...problem,
              dateAdded: problem.dateAdded || new Date().toISOString(),
              lastModified: new Date().toISOString(),
            }

            this.problemsData[topic].push(newProblem)
            importStats.imported++
          } catch (error) {
            console.error(`Error processing problem ${problem.title}:`, error)
            importStats.errors++
          }
        }
      }

      // Import goals if present
      if (data.goals) {
        this.userGoals = { ...this.userGoals, ...data.goals }
        await this.saveGoalsData()
      }

      // Save all changes
      await this.saveData()

      if (loadingOverlay) loadingOverlay.style.display = "none"
      this.showImportSummary(importStats)

      // Refresh the display
      this.buildWebsite()
      this.populateFilters()
      this.updateStats()
      this.updateStreak()
    } catch (error) {
      console.error("Import error:", error)
      if (loadingOverlay) loadingOverlay.style.display = "none"
      this.showToast("Import failed: " + error.message, "error")
    }
  }

  showImportSummary(stats) {
    const modal = document.createElement("div")
    modal.className = "modal show"
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Import Summary</h3>
                    <button class="close-btn" onclick="window.app.closeImportModal(this)">&times;</button>
                </div>
                <div style="padding: 1.5rem;">
                    <div class="import-summary">
                        <div class="summary-item">
                            <span class="summary-label">Total Problems:</span>
                            <span class="summary-value">${stats.total}</span>
                        </div>
                        <div class="summary-item success">
                            <span class="summary-label">✅ Imported:</span>
                            <span class="summary-value">${stats.imported}</span>
                        </div>
                        ${
                          stats.updated > 0
                            ? `
                        <div class="summary-item warning">
                            <span class="summary-label">🔄 Updated:</span>
                            <span class="summary-value">${stats.updated}</span>
                        </div>
                        `
                            : ""
                        }
                        ${
                          stats.skipped > 0
                            ? `
                        <div class="summary-item info">
                            <span class="summary-label">⏭️ Skipped:</span>
                            <span class="summary-value">${stats.skipped}</span>
                        </div>
                        `
                            : ""
                        }
                        ${
                          stats.errors > 0
                            ? `
                        <div class="summary-item error">
                            <span class="summary-label">❌ Errors:</span>
                            <span class="summary-value">${stats.errors}</span>
                        </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="form-actions" style="margin-top: 1.5rem;">
                        <button class="btn btn-primary" onclick="window.app.closeImportModal(this)">Close</button>
                    </div>
                </div>
            </div>
        `
    document.body.appendChild(modal)

    // Show success toast
    if (stats.imported > 0 || stats.updated > 0) {
      this.showToast(`Successfully processed ${stats.imported + stats.updated} problems!`, "success")
    }
  }

  debounceSearch() {
    clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => this.searchProblems(), 300)
  }

  handleKeyboardShortcuts(e) {
    if (e.ctrlKey && e.key === "k") {
      e.preventDefault()
      const searchInput = document.getElementById("searchInput")
      if (searchInput) searchInput.focus()
    }
    if (e.key === "Escape") {
      this.closeModal()
      this.closeGoalsModal()
    }
    if (e.ctrlKey && e.key === "n") {
      e.preventDefault()
      this.addProblem()
    }
  }

  // Theme Management
  initializeTheme() {
    const savedTheme = localStorage.getItem("dsaTrackerTheme") || "light"
    document.documentElement.setAttribute("data-theme", savedTheme)
    this.updateThemeIcon(savedTheme)
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme")
    const newTheme = currentTheme === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("dsaTrackerTheme", newTheme)
    this.updateThemeIcon(newTheme)
    this.showToast("Theme updated!", "success")
  }

  updateThemeIcon(theme) {
    const themeToggle = document.querySelector(".theme-toggle")
    if (themeToggle) {
      themeToggle.textContent = theme === "dark" ? "☀️" : "🌙"
    }
  }

  // Authentication
  async handleLogin(e) {
    e.preventDefault()
    const loginBtn = document.querySelector(".login-btn")
    if (!loginBtn) return

    const usernameInput = document.getElementById("username")
    const passwordInput = document.getElementById("password")

    if (!usernameInput || !passwordInput) {
      this.showToast("Login form elements not found", "error")
      return
    }

    const username = usernameInput.value.trim()
    const password = passwordInput.value

    if (!username || !password) {
      this.showToast("Please fill in all fields", "error")
      return
    }

    // Show loading state
    loginBtn.classList.add("loading")
    loginBtn.disabled = true

    try {
      // Simulate network delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (this.DEMO_USERS[username] && this.DEMO_USERS[username] === password) {
        this.currentUser = username
        localStorage.setItem("dsaTrackerUser", username)
        await this.showApp()
        this.showToast(`Welcome back, ${username}!`, "success")
      } else {
        throw new Error("Invalid credentials")
      }
    } catch (error) {
      this.showToast("Invalid credentials! Try: admin / admin123", "error")
    } finally {
      loginBtn.classList.remove("loading")
      loginBtn.disabled = false
    }
  }

  checkLoginStatus() {
    const savedUser = localStorage.getItem("dsaTrackerUser")
    if (savedUser && this.DEMO_USERS[savedUser]) {
      this.currentUser = savedUser
      this.showApp()
    } else {
      this.showLogin()
    }
  }

  showLogin() {
    const loginContainer = document.getElementById("loginContainer")
    const appContainer = document.getElementById("appContainer")
    const loadingOverlay = document.getElementById("loadingOverlay")

    if (loginContainer) loginContainer.style.display = "flex"
    if (appContainer) appContainer.classList.remove("show")
    if (loadingOverlay) loadingOverlay.style.display = "none"
  }

  async showApp() {
    const loginContainer = document.getElementById("loginContainer")
    const appContainer = document.getElementById("appContainer")
    const loadingOverlay = document.getElementById("loadingOverlay")

    if (loginContainer) loginContainer.style.display = "none"
    if (loadingOverlay) loadingOverlay.style.display = "flex"

    try {
      await this.initializeApp()
      if (appContainer) appContainer.classList.add("show")

      const currentUserElement = document.getElementById("currentUser")
      if (currentUserElement) {
        currentUserElement.textContent = this.currentUser
      }
    } catch (error) {
      console.error("Error initializing app:", error)
      this.showToast("Error loading data. Please try again.", "error")
    } finally {
      if (loadingOverlay) loadingOverlay.style.display = "none"
    }
  }

  logout() {
    localStorage.removeItem("dsaTrackerUser")
    this.currentUser = null
    this.problemsData = {}
    this.userGoals = {}
    this.showLogin()
    this.showToast("Logged out successfully", "success")
  }

  // Demo account helpers
  fillDemo(username, password) {
    const usernameInput = document.getElementById("username")
    const passwordInput = document.getElementById("password")
    if (usernameInput) usernameInput.value = username
    if (passwordInput) passwordInput.value = password
  }

  // Data Management - localStorage first, Firebase backup
  async initializeApp() {
    console.log("Loading app data...")
    try {
      // Wait a bit for Firebase to initialize if it's being fetched
      await new Promise((resolve) => setTimeout(resolve, 1000))

      await Promise.all([this.loadData(), this.loadGoals()])
      this.buildWebsite()
      this.populateFilters()
      this.updateStats()
      this.updateStreak()
      console.log("App initialized successfully")
    } catch (error) {
      console.error("Error in initializeApp:", error)
      throw error
    }
  }

  async loadData() {
    try {
      // Try localStorage first
      const localData = localStorage.getItem(`dsaTracker_problems_${this.currentUser}`)
      if (localData) {
        this.problemsData = JSON.parse(localData)
        console.log("Data loaded from localStorage:", Object.keys(this.problemsData).length, "topics")
      } else {
        // Fallback to default data
        console.log("No existing data, loading defaults")
        this.problemsData = this.getDefaultData()
        await this.saveData()
      }

      // Optional: Try to sync with Firebase in background
      this.syncWithFirebase()
    } catch (error) {
      console.error("Error loading data:", error)
      this.problemsData = this.getDefaultData()
      this.showToast("Using default data.", "warning")
    }
  }

  async loadGoals() {
    try {
      // Try localStorage first
      const localGoals = localStorage.getItem(`dsaTracker_goals_${this.currentUser}`)
      if (localGoals) {
        this.userGoals = JSON.parse(localGoals)
      } else {
        this.userGoals = {
          daily: 1,
          weekly: 7,
          targetDate: "",
        }
        await this.saveGoalsData()
      }
      console.log("Goals loaded successfully")
    } catch (error) {
      console.error("Error loading goals:", error)
      this.userGoals = { daily: 1, weekly: 7, targetDate: "" }
    }
  }

  // Optional Firebase sync (runs in background)
  async syncWithFirebase() {
    if (!database) return

    try {
      // Try to load from Firebase as backup
      const snapshot = await database.ref(`users/${this.currentUser}/problems`).once("value")
      const firebaseData = snapshot.val()

      if (firebaseData && Object.keys(firebaseData).length > Object.keys(this.problemsData).length) {
        // Firebase has more data, use it
        this.problemsData = firebaseData
        localStorage.setItem(`dsaTracker_problems_${this.currentUser}`, JSON.stringify(this.problemsData))
        this.buildWebsite()
        this.populateFilters()
        this.updateStats()
        console.log("Synced data from Firebase")
      }
    } catch (error) {
      console.warn("Firebase sync failed (this is okay):", error.message)
    }
  }

  getDefaultData() {
    return {
      "Array & String": [
        {
          title: "Two Sum",
          link: "https://leetcode.com/problems/two-sum/",
          difficulty: "Easy",
          solution: "",
          timeComplexity: "",
          spaceComplexity: "",
          tags: ["Hash Map", "Array"],
          attempts: 0,
          lastSolved: "",
          notes: "",
          dateAdded: new Date().toISOString(),
        },
        {
          title: "3Sum",
          link: "https://leetcode.com/problems/3sum/",
          difficulty: "Medium",
          solution: "",
          timeComplexity: "",
          spaceComplexity: "",
          tags: ["Two Pointers", "Array"],
          attempts: 0,
          lastSolved: "",
          notes: "",
          dateAdded: new Date().toISOString(),
        },
      ],
      "Dynamic Programming": [
        {
          title: "Fibonacci Number",
          link: "https://leetcode.com/problems/fibonacci-number/",
          difficulty: "Easy",
          solution: "",
          timeComplexity: "",
          spaceComplexity: "",
          tags: ["Memoization", "Bottom-up"],
          attempts: 0,
          lastSolved: "",
          notes: "",
          dateAdded: new Date().toISOString(),
        },
      ],
    }
  }

  async saveData() {
    try {
      // Save to localStorage (primary)
      localStorage.setItem(`dsaTracker_problems_${this.currentUser}`, JSON.stringify(this.problemsData))
      console.log("Data saved to localStorage successfully")

      // Optional: Try to backup to Firebase
      if (database) {
        try {
          await database.ref(`users/${this.currentUser}/problems`).set(this.problemsData)
          console.log("Data backed up to Firebase successfully")
        } catch (error) {
          console.warn("Firebase backup failed (this is okay):", error.message)
        }
      }
    } catch (error) {
      console.error("Error saving data:", error)
      this.showToast("Error saving data. Please try again.", "error")
    }
  }

  async saveGoalsData() {
    try {
      // Save to localStorage (primary)
      localStorage.setItem(`dsaTracker_goals_${this.currentUser}`, JSON.stringify(this.userGoals))
      console.log("Goals saved to localStorage successfully")

      // Optional: Try to backup to Firebase
      if (database) {
        try {
          await database.ref(`users/${this.currentUser}/goals`).set(this.userGoals)
          console.log("Goals backed up to Firebase successfully")
        } catch (error) {
          console.warn("Firebase goals backup failed (this is okay):", error.message)
        }
      }
    } catch (error) {
      console.error("Error saving goals:", error)
      this.showToast("Error saving goals. Please try again.", "error")
    }
  }

  // Enhanced duplicate checking functionality
  async checkProblemExists(title, link, topic) {
    try {
      // Check by title in the same topic
      let existsByTitle = false
      let existsByLink = false
      let titleDoc = null
      let linkDoc = null

      // Check in current data structure
      if (this.problemsData[topic]) {
        const titleMatch = this.problemsData[topic].find((p) => p.title === title)
        if (titleMatch) {
          existsByTitle = true
          titleDoc = titleMatch
        }
      }

      // Check by link across all topics
      for (const topicName in this.problemsData) {
        const linkMatch = this.problemsData[topicName].find((p) => p.link === link)
        if (linkMatch) {
          existsByLink = true
          linkDoc = linkMatch
          break
        }
      }

      return {
        existsByTitle,
        existsByLink,
        titleDoc,
        linkDoc,
      }
    } catch (error) {
      console.error("Error checking problem existence:", error)
      return {
        existsByTitle: false,
        existsByLink: false,
        titleDoc: null,
        linkDoc: null,
      }
    }
  }

  // UI Building
  buildWebsite() {
    const topicsContainer = document.getElementById("topicsContainer")
    const emptyState = document.getElementById("emptyState")

    if (!topicsContainer) {
      console.error("Topics container not found")
      return
    }

    const filteredData = this.getFilteredData()
    topicsContainer.innerHTML = ""

    if (Object.keys(filteredData).length === 0) {
      if (emptyState) emptyState.style.display = "block"
      return
    }

    if (emptyState) emptyState.style.display = "none"

    Object.entries(filteredData).forEach(([topic, problems], index) => {
      if (problems.length === 0) return

      const topicCard = this.createTopicCard(topic, problems)
      topicCard.style.animationDelay = `${index * 0.1}s`
      topicsContainer.appendChild(topicCard)
    })
  }

  createTopicCard(topic, problems) {
    const topicCard = document.createElement("div")
    topicCard.className = "topic-card"

    const solvedCount = problems.filter((p) => p.solution && p.solution.trim()).length
    const totalCount = problems.length

    topicCard.innerHTML = `
            <div class="topic-header">
                <h3 class="topic-title">${this.escapeHTML(topic)}</h3>
                <div class="topic-progress">${solvedCount}/${totalCount}</div>
            </div>
            <div class="problems-list">
                ${problems.map((problem) => this.createProblemHTML(problem, topic)).join("")}
            </div>
        `

    return topicCard
  }

  createProblemHTML(problem, topic) {
    const hasSolution = problem.solution && problem.solution.trim()
    const solutionId = `solution-${this.generateId(topic)}-${this.generateId(problem.title)}`
    const lastSolvedDate = problem.lastSolved ? new Date(problem.lastSolved).toLocaleDateString() : ""
    const score = this.calculateProblemScore(problem)

    return `
            <div class="problem-item" data-difficulty="${problem.difficulty || "Easy"}">
                <div class="problem-header">
                    <div class="problem-title">
                        <a href="${problem.link}" target="_blank" class="problem-link" rel="noopener noreferrer">
                            ${this.escapeHTML(problem.title)}
                        </a>
                        ${
                          problem.tags && problem.tags.length
                            ? `
                            <div class="problem-tags">
                                ${problem.tags.map((tag) => `<span class="tag">${this.escapeHTML(tag)}</span>`).join("")}
                            </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="problem-badges">
                        <span class="difficulty-badge difficulty-${(problem.difficulty || "Easy").toLowerCase()}">
                            ${problem.difficulty || "Easy"}
                        </span>
                        <span class="status-badge ${hasSolution ? "status-solved" : "status-unsolved"}">
                            ${hasSolution ? "Solved" : "Unsolved"}
                        </span>
                        ${
                          problem.attempts > 0
                            ? `
                            <span class="tag" style="background: #fff3e0; color: #f57c00;">
                                Attempts: ${problem.attempts}
                            </span>
                        `
                            : ""
                        }
                        ${
                          score > 0
                            ? `
                            <span class="tag" style="background: #e8f5e8; color: #2e7d32;">
                                Score: ${score}
                            </span>
                        `
                            : ""
                        }
                    </div>
                </div>
                ${
                  problem.timeComplexity || problem.spaceComplexity
                    ? `
                    <div class="problem-meta">
                        ${problem.timeComplexity ? `<span>⏱️ Time: ${this.escapeHTML(problem.timeComplexity)}</span>` : ""}
                        ${problem.spaceComplexity ? `<span>💾 Space: ${this.escapeHTML(problem.spaceComplexity)}</span>` : ""}
                    </div>
                `
                    : ""
                }
                ${
                  lastSolvedDate
                    ? `
                    <div class="problem-meta">
                        <span>Last solved: ${lastSolvedDate}</span>
                    </div>
                `
                    : ""
                }
                <div class="problem-actions">
                    <button class="solution-btn ${hasSolution ? "primary" : ""}" onclick="window.app.toggleSolution('${solutionId}')">
                        ${hasSolution ? "View Solution" : "Add Solution"}
                    </button>
                    <button class="solution-btn warning" onclick="window.app.editProblem('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}')">
                        Edit
                    </button>
                    <button class="solution-btn success" onclick="window.app.markAsSolved('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}')">
                        Mark Solved
                    </button>
                    <button class="solution-btn danger" onclick="window.app.deleteProblem('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}')">
                        Delete
                    </button>
                </div>
                <div class="solution-content" id="${solutionId}">
                    ${
                      hasSolution
                        ? `
                        <div class="solution-code">${this.escapeHTML(problem.solution)}</div>
                        ${
                          problem.notes
                            ? `
                            <div class="problem-notes">
                                <strong>Notes:</strong><br>${this.escapeHTML(problem.notes)}
                            </div>
                        `
                            : ""
                        }
                    `
                        : `
                        <textarea class="solution-textarea"
                                   placeholder="Paste your solution here..."
                                   onblur="window.app.quickSaveSolution('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}', this.value)"></textarea>
                    `
                    }
                </div>
            </div>
        `
  }

  // Filtering and Search
  getFilteredData() {
    const filtered = {}

    for (const topic in this.problemsData) {
      if (this.currentFilter.topic && topic !== this.currentFilter.topic) continue

      const filteredProblems = this.problemsData[topic].filter((problem) => {
        const matchesSearch =
          !this.currentFilter.search ||
          problem.title.toLowerCase().includes(this.currentFilter.search.toLowerCase()) ||
          topic.toLowerCase().includes(this.currentFilter.search.toLowerCase()) ||
          (problem.tags &&
            problem.tags.some((tag) => tag.toLowerCase().includes(this.currentFilter.search.toLowerCase())))

        const matchesDifficulty =
          !this.currentFilter.difficulty || (problem.difficulty || "Easy") === this.currentFilter.difficulty

        const matchesTag = !this.currentFilter.tag || (problem.tags && problem.tags.includes(this.currentFilter.tag))

        const matchesStatus =
          !this.currentFilter.status ||
          (this.currentFilter.status === "solved" && problem.solution && problem.solution.trim()) ||
          (this.currentFilter.status === "unsolved" && (!problem.solution || !problem.solution.trim()))

        return matchesSearch && matchesDifficulty && matchesTag && matchesStatus
      })

      if (filteredProblems.length > 0) {
        filtered[topic] = filteredProblems
      }
    }

    return filtered
  }

  searchProblems() {
    const searchInput = document.getElementById("searchInput")
    if (searchInput) {
      this.currentFilter.search = searchInput.value.trim()
      this.buildWebsite()
      this.updateClearSearchButton()
    }
  }

  clearSearch() {
    const searchInput = document.getElementById("searchInput")
    if (searchInput) {
      searchInput.value = ""
      this.currentFilter.search = ""
      this.buildWebsite()
      this.updateClearSearchButton()
    }
  }

  updateClearSearchButton() {
    const clearBtn = document.getElementById("clearSearch")
    const searchInput = document.getElementById("searchInput")
    if (clearBtn && searchInput) {
      clearBtn.style.opacity = searchInput.value ? "1" : "0"
    }
  }

  filterByTopic() {
    const topicFilter = document.getElementById("topicFilter")
    if (topicFilter) {
      this.currentFilter.topic = topicFilter.value
      this.buildWebsite()
    }
  }

  filterByTag() {
    const tagFilter = document.getElementById("tagFilter")
    if (tagFilter) {
      this.currentFilter.tag = tagFilter.value
      this.buildWebsite()
    }
  }

  filterByStatus() {
    const statusFilter = document.getElementById("statusFilter")
    if (statusFilter) {
      this.currentFilter.status = statusFilter.value
      this.buildWebsite()
    }
  }

  filterByDifficulty(button, difficulty) {
    document.querySelectorAll(".difficulty-btn").forEach((btn) => btn.classList.remove("active"))
    if (button) button.classList.add("active")
    this.currentFilter.difficulty = difficulty
    this.buildWebsite()
  }

  populateFilters() {
    this.populateTopicFilter()
    this.populateTagFilter()
  }

  populateTopicFilter() {
    const select = document.getElementById("topicFilter")
    if (!select) return

    select.innerHTML = '<option value="">All Topics</option>'

    Object.keys(this.problemsData)
      .sort()
      .forEach((topic) => {
        const option = document.createElement("option")
        option.value = topic
        option.textContent = topic
        select.appendChild(option)
      })
  }

  populateTagFilter() {
    const tagSet = new Set()
    Object.values(this.problemsData).forEach((problems) => {
      problems.forEach((problem) => {
        if (problem.tags && Array.isArray(problem.tags)) {
          problem.tags.forEach((tag) => tagSet.add(tag))
        }
      })
    })

    const select = document.getElementById("tagFilter")
    if (!select) return

    select.innerHTML = '<option value="">All Tags</option>'

    Array.from(tagSet)
      .sort()
      .forEach((tag) => {
        const option = document.createElement("option")
        option.value = tag
        option.textContent = tag
        select.appendChild(option)
      })
  }

  // Problem Management
  toggleSolution(solutionId) {
    const solutionDiv = document.getElementById(solutionId)
    if (solutionDiv) {
      solutionDiv.classList.toggle("show")
    }
  }

  async quickSaveSolution(topic, title, solutionText) {
    if (!solutionText.trim()) return

    const problem = this.problemsData[topic]?.find((p) => p.title === title)
    if (problem) {
      problem.solution = solutionText
      problem.lastSolved = new Date().toISOString().split("T")[0]
      problem.attempts = (problem.attempts || 0) + 1

      await this.saveData()
      this.buildWebsite()
      this.updateStats()
      this.updateStreak()
      this.showToast("Solution saved!", "success")
    }
  }

  editProblem(topic, title) {
    const problem = this.problemsData[topic]?.find((p) => p.title === title)
    if (problem) {
      this.isEditMode = true
      this.editingProblem = { topic, title }

      const modalTitle = document.getElementById("modalTitle")
      const submitBtn = document.getElementById("submitBtn")

      if (modalTitle) modalTitle.textContent = "Edit Problem"
      if (submitBtn) submitBtn.textContent = "Update Problem"

      // Populate form with current values
      const elements = {
        newProblemTopic: topic,
        newProblemTitle: problem.title,
        newProblemLink: problem.link,
        newProblemDifficulty: problem.difficulty || "Easy",
        newProblemTags: problem.tags ? problem.tags.join(", ") : "",
        newProblemSolution: problem.solution || "",
        newProblemTime: problem.timeComplexity || "",
        newProblemSpace: problem.spaceComplexity || "",
        newProblemAttempts: problem.attempts || 0,
        newProblemNotes: problem.notes || "",
      }

      // Set values for each form element
      Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id)
        if (element) {
          element.value = value
          console.log(`Set ${id} to:`, value) // Debug log
        } else {
          console.warn(`Element ${id} not found`) // Debug log
        }
      })

      const modal = document.getElementById("addProblemModal")
      if (modal) {
        modal.classList.add("show")
        console.log("Edit modal opened for:", problem.title) // Debug log
      }
    } else {
      console.error("Problem not found:", topic, title)
      this.showToast("Problem not found", "error")
    }
  }

  async markAsSolved(topic, title) {
    const problem = this.problemsData[topic]?.find((p) => p.title === title)
    if (problem) {
      problem.attempts = (problem.attempts || 0) + 1
      problem.lastSolved = new Date().toISOString().split("T")[0]

      await this.saveData()
      this.buildWebsite()
      this.updateStats()
      this.updateStreak()
      this.showToast("Problem marked as solved!", "success")
    }
  }

  async deleteProblem(topic, title) {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return

    const topicProblems = this.problemsData[topic]
    if (topicProblems) {
      const index = topicProblems.findIndex((p) => p.title === title)
      if (index > -1) {
        topicProblems.splice(index, 1)
        if (topicProblems.length === 0) {
          delete this.problemsData[topic]
        }

        await this.saveData()
        this.buildWebsite()
        this.populateFilters()
        this.updateStats()
        this.showToast("Problem deleted successfully", "success")
      }
    }
  }

  // Modal Management
  addProblem() {
    this.isEditMode = false
    this.editingProblem = null

    const modalTitle = document.getElementById("modalTitle")
    const submitBtn = document.getElementById("submitBtn")
    const form = document.getElementById("addProblemForm")
    const attemptsInput = document.getElementById("newProblemAttempts")
    const modal = document.getElementById("addProblemModal")

    if (modalTitle) modalTitle.textContent = "Add New Problem"
    if (submitBtn) submitBtn.textContent = "Add Problem"
    if (form) form.reset()
    if (attemptsInput) attemptsInput.value = 0
    if (modal) modal.classList.add("show")
  }

  closeModal() {
    const modal = document.getElementById("addProblemModal")
    const form = document.getElementById("addProblemForm")

    if (modal) modal.classList.remove("show")
    if (form) form.reset()

    this.isEditMode = false
    this.editingProblem = null
  }

  async handleAddProblem(e) {
    e.preventDefault()

    const getElementValue = (id) => {
      const element = document.getElementById(id)
      return element ? element.value.trim() : ""
    }

    const formData = {
      topic: getElementValue("newProblemTopic"),
      title: getElementValue("newProblemTitle"),
      link: getElementValue("newProblemLink"),
      difficulty: getElementValue("newProblemDifficulty"),
      tags: getElementValue("newProblemTags"),
      solution: getElementValue("newProblemSolution"),
      timeComplexity: getElementValue("newProblemTime"),
      spaceComplexity: getElementValue("newProblemSpace"),
      attempts: Number.parseInt(getElementValue("newProblemAttempts")) || 0,
      notes: getElementValue("newProblemNotes"),
    }

    console.log("Form data:", formData) // Debug log
    console.log("Edit mode:", this.isEditMode) // Debug log

    if (!formData.topic || !formData.title || !formData.link || !formData.difficulty) {
      this.showToast("Please fill in all required fields", "error")
      return
    }

    // Enhanced duplicate checking for manual addition (skip for edit mode)
    if (!this.isEditMode) {
      const existsCheck = await this.checkProblemExists(formData.title, formData.link, formData.topic)

      if (existsCheck.existsByTitle) {
        const confirmed = confirm(
          `A problem with the title "${formData.title}" already exists in ${formData.topic}. Do you want to add it anyway?`,
        )
        if (!confirmed) return
      }

      if (existsCheck.existsByLink && formData.link) {
        const existingDoc = existsCheck.linkDoc
        const existingTopic = Object.keys(this.problemsData).find((t) => this.problemsData[t].includes(existingDoc))
        const confirmed = confirm(
          `A problem with this link already exists: "${existingDoc.title}" in ${existingTopic}. Do you want to add it anyway?`,
        )
        if (!confirmed) return
      }
    }

    const tags = formData.tags
      ? formData.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag)
      : []

    const problemData = {
      title: formData.title,
      link: formData.link,
      difficulty: formData.difficulty,
      solution: formData.solution,
      timeComplexity: formData.timeComplexity,
      spaceComplexity: formData.spaceComplexity,
      tags: tags,
      attempts: formData.attempts,
      lastSolved: formData.solution ? new Date().toISOString().split("T")[0] : "",
      notes: formData.notes,
      dateAdded: new Date().toISOString(),
    }

    try {
      if (this.isEditMode && this.editingProblem) {
        console.log("Updating existing problem...")
        await this.updateExistingProblem(formData.topic, problemData)
        this.showToast("Problem updated successfully!", "success")
      } else {
        console.log("Adding new problem...")
        await this.addNewProblem(formData.topic, problemData)
        this.showToast("Problem added successfully!", "success")
      }

      await this.saveData()
      this.buildWebsite()
      this.populateFilters()
      this.updateStats()
      this.closeModal()
    } catch (error) {
      console.error("Error saving problem:", error)
      this.showToast("Error saving problem: " + error.message, "error")
    }
  }

  async updateExistingProblem(newTopic, problemData) {
    const oldTopic = this.editingProblem.topic
    const oldTitle = this.editingProblem.title

    console.log("Updating problem:", oldTitle, "from", oldTopic, "to", newTopic)

    // Find and update the problem
    const oldTopicProblems = this.problemsData[oldTopic]
    if (oldTopicProblems) {
      const index = oldTopicProblems.findIndex((p) => p.title === oldTitle)
      if (index > -1) {
        // If moving to a different topic
        if (oldTopic !== newTopic) {
          // Remove from old topic
          oldTopicProblems.splice(index, 1)

          // Delete topic if empty
          if (oldTopicProblems.length === 0) {
            delete this.problemsData[oldTopic]
          }

          // Add to new topic
          if (!this.problemsData[newTopic]) {
            this.problemsData[newTopic] = []
          }
          this.problemsData[newTopic].push({
            ...problemData,
            dateAdded: this.problemsData[oldTopic]?.[index]?.dateAdded || new Date().toISOString(),
            lastModified: new Date().toISOString(),
          })
        } else {
          // Update in same topic
          this.problemsData[oldTopic][index] = {
            ...problemData,
            dateAdded: oldTopicProblems[index].dateAdded || new Date().toISOString(),
            lastModified: new Date().toISOString(),
          }
        }

        console.log("Problem updated successfully")
      } else {
        console.error("Problem index not found")
        throw new Error("Problem not found for update")
      }
    } else {
      console.error("Topic not found:", oldTopic)
      throw new Error("Topic not found")
    }
  }

  async addNewProblem(topic, problemData) {
    if (!this.problemsData[topic]) {
      this.problemsData[topic] = []
    }
    this.problemsData[topic].push(problemData)
  }

  // Goals Management
  showGoals() {
    const dailyGoal = document.getElementById("dailyGoal")
    const weeklyGoal = document.getElementById("weeklyGoal")
    const targetDate = document.getElementById("targetDate")
    const modal = document.getElementById("goalsModal")

    if (dailyGoal) dailyGoal.value = this.userGoals.daily || 1
    if (weeklyGoal) weeklyGoal.value = this.userGoals.weekly || 7
    if (targetDate) targetDate.value = this.userGoals.targetDate || ""
    if (modal) modal.classList.add("show")
  }

  closeGoalsModal() {
    const modal = document.getElementById("goalsModal")
    if (modal) modal.classList.remove("show")
  }

  async saveGoals() {
    const dailyGoalElement = document.getElementById("dailyGoal")
    const weeklyGoalElement = document.getElementById("weeklyGoal")
    const targetDateElement = document.getElementById("targetDate")

    const dailyGoal = dailyGoalElement ? Number.parseInt(dailyGoalElement.value) || 1 : 1
    const weeklyGoal = weeklyGoalElement ? Number.parseInt(weeklyGoalElement.value) || 7 : 7
    const targetDate = targetDateElement ? targetDateElement.value : ""

    this.userGoals = {
      daily: dailyGoal,
      weekly: weeklyGoal,
      targetDate: targetDate,
    }

    try {
      await this.saveGoalsData()
      this.closeGoalsModal()
      this.showToast("Goals saved successfully!", "success")
      this.updateStats()
    } catch (error) {
      console.error("Error saving goals:", error)
      this.showToast("Error saving goals. Please try again.", "error")
    }
  }

  // Analytics and Stats
  updateStats() {
    let totalProblems = 0
    let solvedProblems = 0
    let totalScore = 0

    for (const topic in this.problemsData) {
      totalProblems += this.problemsData[topic].length
      this.problemsData[topic].forEach((problem) => {
        if (problem.solution && problem.solution.trim()) {
          solvedProblems++
        }
        totalScore += this.calculateProblemScore(problem)
      })
    }

    const progressPercent = totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0

    // Update DOM elements safely
    const updateElement = (id, value) => {
      const element = document.getElementById(id)
      if (element) element.textContent = value
    }

    updateElement("totalProblems", totalProblems)
    updateElement("solvedProblems", solvedProblems)
    updateElement("progressPercent", progressPercent + "%")
    updateElement("totalScore", totalScore)
    updateElement("progressText", `${solvedProblems} / ${totalProblems} problems solved`)

    const progressBar = document.getElementById("progressBar")
    if (progressBar) progressBar.style.width = progressPercent + "%"
  }

  calculateProblemScore(problem) {
    if (!problem.solution || !problem.solution.trim()) return 0

    const difficultyScores = { Easy: 1, Medium: 3, Hard: 5 }
    const baseScore = difficultyScores[problem.difficulty] || 1

    // Bonus for fewer attempts
    const attemptBonus = problem.attempts <= 1 ? 2 : problem.attempts <= 3 ? 1 : 0

    return baseScore + attemptBonus
  }

  updateStreak() {
    const streak = this.calculateStreak()
    const currentStreakElement = document.getElementById("currentStreak")
    const streakInfoElement = document.getElementById("streakInfo")

    if (currentStreakElement) currentStreakElement.textContent = streak

    if (streakInfoElement) {
      if (streak > 0) {
        streakInfoElement.textContent = `🔥 ${streak} day streak!`
        streakInfoElement.style.display = "inline"
      } else {
        streakInfoElement.style.display = "none"
      }
    }
  }

  calculateStreak() {
    const solvedDates = []
    Object.values(this.problemsData).forEach((problems) => {
      problems.forEach((problem) => {
        if (problem.lastSolved) {
          solvedDates.push(new Date(problem.lastSolved))
        }
      })
    })

    if (solvedDates.length === 0) return 0

    // Sort dates in descending order
    solvedDates.sort((a, b) => b - a)

    // Remove duplicates
    const uniqueDates = [...new Set(solvedDates.map((d) => d.toDateString()))].map((d) => new Date(d))

    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < uniqueDates.length; i++) {
      const date = new Date(uniqueDates[i])
      date.setHours(0, 0, 0, 0)

      const daysDiff = Math.floor((today - date) / (1000 * 60 * 60 * 24))

      if (daysDiff === streak) {
        streak++
      } else {
        break
      }
    }

    return streak
  }

  showAnalytics() {
    const analyticsHTML = this.generateAnalyticsHTML()
    const modalContent = document.querySelector("#addProblemModal .modal-content")
    if (modalContent) {
      modalContent.innerHTML = `
                <div class="modal-header">
                    <h3>📊 Analytics Dashboard</h3>
                    <button class="close-btn" onclick="window.app.closeModal()">&times;</button>
                </div>
                ${analyticsHTML}
            `
    }

    const modal = document.getElementById("addProblemModal")
    if (modal) modal.classList.add("show")
  }

  generateAnalyticsHTML() {
    let html = '<div style="max-height: 70vh; overflow-y: auto; padding: 1.5rem;">'

    // Topic-wise progress
    html += '<h4 style="margin-bottom: 1rem; color: var(--text-primary);">Topic-wise Progress:</h4>'

    for (const topic in this.problemsData) {
      const total = this.problemsData[topic].length
      const solved = this.problemsData[topic].filter((p) => p.solution && p.solution.trim()).length
      const percentage = total > 0 ? Math.round((solved / total) * 100) : 0

      html += `
                <div style="margin: 12px 0; padding: 12px; background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: var(--text-primary);">${this.escapeHTML(topic)}</strong>
                        <span style="color: var(--text-secondary);">${solved}/${total} (${percentage}%)</span>
                    </div>
                    <div style="background: var(--border); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: var(--success-color); height: 100%; width: ${percentage}%; border-radius: 4px; transition: width 0.3s ease;"></div>
                    </div>
                </div>
            `
    }

    html += "</div>"
    return html
  }

  // Import/Export
  downloadJSON() {
    const exportData = {
      problems: this.problemsData,
      goals: this.userGoals,
      exportDate: new Date().toISOString(),
      version: "2.0",
    }

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `dsa_tracker_${this.currentUser}_${new Date().toISOString().split("T")[0]}.json`
    link.click()
    URL.revokeObjectURL(url)

    this.showToast("Data exported successfully!", "success")
  }

  // Toast Notifications
  showToast(message, type = "info", duration = 5000) {
    const toastContainer = document.getElementById("toastContainer")
    if (!toastContainer) {
      console.log(`Toast: ${message} (${type})`)
      return
    }

    const toast = document.createElement("div")
    toast.className = `toast ${type}`

    const icons = {
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
    }

    toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${this.escapeHTML(message)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
            <div class="toast-progress"></div>
        `

    toastContainer.appendChild(toast)

    // Auto remove after duration
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove()
      }
    }, duration)
  }

  // Utility Functions
  escapeHTML(str) {
    if (!str) return ""
    return str.replace(
      /[&<>'"]/g,
      (tag) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[tag] || tag,
    )
  }

  generateId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
  }

  // Add these new methods to the DSATracker class after the existing methods:

  // Page Navigation System
  showPage(pageName) {
    // Update navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active")
    })
    document.querySelector(`[data-page="${pageName}"]`).classList.add("active")

    // Hide all pages
    document.querySelectorAll(".page-content").forEach((page) => {
      page.style.display = "none"
    })

    // Show selected page
    const targetPage = document.getElementById(`${pageName}Page`)
    if (targetPage) {
      targetPage.style.display = "block"
    }

    // Load page-specific content
    switch (pageName) {
      case "dashboard":
        this.loadDashboard()
        break
      case "categories":
        this.loadCategories()
        break
      case "problems":
        this.loadProblems()
        break
      case "analytics":
        this.loadAnalytics()
        break
    }
  }

  // Dashboard Page
  loadDashboard() {
    this.updateStats()
    this.updateStreak()
    this.loadRecentActivity()
  }

  loadRecentActivity() {
    const recentActivity = document.getElementById("recentActivity")
    if (!recentActivity) return

    // Get recent solved problems
    const recentProblems = []
    Object.entries(this.problemsData).forEach(([topic, problems]) => {
      problems.forEach((problem) => {
        if (problem.lastSolved) {
          recentProblems.push({
            ...problem,
            topic,
            solvedDate: new Date(problem.lastSolved),
          })
        }
      })
    })

    // Sort by most recent
    recentProblems.sort((a, b) => b.solvedDate - a.solvedDate)
    const recent = recentProblems.slice(0, 5)

    if (recent.length === 0) {
      recentActivity.innerHTML = '<p class="no-activity">No recent activity</p>'
      return
    }

    recentActivity.innerHTML = recent
      .map(
        (problem) => `
    <div class="activity-item" style="padding: 0.75rem 0; border-bottom: 1px solid var(--border);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--text-primary);">${this.escapeHTML(problem.title)}</strong>
          <span style="color: var(--text-secondary); margin-left: 0.5rem;">(${this.escapeHTML(problem.topic)})</span>
        </div>
        <span style="color: var(--text-muted); font-size: 0.85rem;">
          ${problem.solvedDate.toLocaleDateString()}
        </span>
      </div>
    </div>
  `,
      )
      .join("")
  }

  // Categories Page
  loadCategories() {
    const categoriesGrid = document.getElementById("categoriesGrid")
    if (!categoriesGrid) return

    categoriesGrid.innerHTML = ""

    Object.entries(this.problemsData).forEach(([topic, problems]) => {
      const totalProblems = problems.length
      const solvedProblems = problems.filter((p) => p.solution && p.solution.trim()).length
      const progressPercent = totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0

      // Count by difficulty
      const difficulties = { Easy: 0, Medium: 0, Hard: 0 }
      problems.forEach((problem) => {
        const diff = problem.difficulty || "Easy"
        difficulties[diff]++
      })

      const categoryCard = document.createElement("div")
      categoryCard.className = "category-card"
      categoryCard.onclick = () => this.showCategoryProblems(topic)

      categoryCard.innerHTML = `
      <div class="category-header">
        <h3 class="category-title">${this.escapeHTML(topic)}</h3>
        <div class="category-count">${totalProblems}</div>
      </div>
      
      <div class="category-progress">
        <div class="category-progress-bar">
          <div class="category-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="category-stats">
          <span>${solvedProblems} solved</span>
          <span>${progressPercent}% complete</span>
        </div>
      </div>

      <div class="category-difficulty">
        ${difficulties.Easy > 0 ? `<span class="difficulty-count easy">Easy: ${difficulties.Easy}</span>` : ""}
        ${difficulties.Medium > 0 ? `<span class="difficulty-count medium">Medium: ${difficulties.Medium}</span>` : ""}
        ${difficulties.Hard > 0 ? `<span class="difficulty-count hard">Hard: ${difficulties.Hard}</span>` : ""}
      </div>
    `

      categoriesGrid.appendChild(categoryCard)
    })

    if (Object.keys(this.problemsData).length === 0) {
      categoriesGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <h3>No categories yet</h3>
        <p>Add your first problem to create categories</p>
        <button class="btn btn-primary" onclick="window.app.addProblem()">Add Problem</button>
      </div>
    `
    }
  }

  // Show problems for specific category
  showCategoryProblems(topic) {
    this.currentFilter.topic = topic
    this.showPage("problems")

    // Update page title
    const titleElement = document.getElementById("problemsPageTitle")
    const subtitleElement = document.getElementById("problemsPageSubtitle")
    const backBtn = document.getElementById("backToCategories")

    if (titleElement) titleElement.textContent = `💻 ${topic}`
    if (subtitleElement) subtitleElement.textContent = `Problems in ${topic} category`
    if (backBtn) backBtn.style.display = "block"
  }

  // Problems Page
  loadProblems(specificTopic = null) {
    if (specificTopic) {
      this.currentFilter.topic = specificTopic
    } else if (!specificTopic && this.currentFilter.topic) {
      // Reset if coming from categories
      this.currentFilter.topic = ""
      const titleElement = document.getElementById("problemsPageTitle")
      const subtitleElement = document.getElementById("problemsPageSubtitle")
      const backBtn = document.getElementById("backToCategories")

      if (titleElement) titleElement.textContent = "💻 All Problems"
      if (subtitleElement) subtitleElement.textContent = "Manage and track your coding problems"
      if (backBtn) backBtn.style.display = "none"
    }

    this.buildProblemsView()
  }

  buildProblemsView() {
    const problemsContainer = document.getElementById("problemsContainer")
    const emptyState = document.getElementById("emptyState")

    if (!problemsContainer) return

    const filteredData = this.getFilteredData()
    problemsContainer.innerHTML = ""

    const allProblems = []
    Object.entries(filteredData).forEach(([topic, problems]) => {
      problems.forEach((problem) => {
        allProblems.push({ ...problem, topic })
      })
    })

    if (allProblems.length === 0) {
      if (emptyState) emptyState.style.display = "block"
      return
    }

    if (emptyState) emptyState.style.display = "none"

    // Sort problems by title
    allProblems.sort((a, b) => a.title.localeCompare(b.title))

    allProblems.forEach((problem, index) => {
      const problemCard = this.createProblemCard(problem, problem.topic)
      problemCard.style.animationDelay = `${index * 0.05}s`
      problemsContainer.appendChild(problemCard)
    })
  }

  createProblemCard(problem, topic) {
    const hasSolution = problem.solution && problem.solution.trim()
    const solutionId = `solution-${this.generateId(topic)}-${this.generateId(problem.title)}`
    const lastSolvedDate = problem.lastSolved ? new Date(problem.lastSolved).toLocaleDateString() : ""
    const score = this.calculateProblemScore(problem)

    const problemCard = document.createElement("div")
    problemCard.className = "problem-card"

    problemCard.innerHTML = `
    <div class="problem-header">
      <div class="problem-title-section">
        <a href="${problem.link}" target="_blank" class="problem-link" rel="noopener noreferrer">
          ${this.escapeHTML(problem.title)}
        </a>
        <div class="problem-badges">
          <span class="difficulty-badge difficulty-${(problem.difficulty || "Easy").toLowerCase()}">
            ${problem.difficulty || "Easy"}
          </span>
          <span class="status-badge ${hasSolution ? "status-solved" : "status-unsolved"}">
            ${hasSolution ? "Solved" : "Unsolved"}
          </span>
          <span class="tag" style="background: var(--surface); color: var(--text-secondary);">
            ${this.escapeHTML(topic)}
          </span>
          ${
            problem.attempts > 0
              ? `
            <span class="tag" style="background: #fff3e0; color: #f57c00;">
              Attempts: ${problem.attempts}
            </span>
          `
              : ""
          }
          ${
            score > 0
              ? `
            <span class="tag" style="background: #e8f5e8; color: #2e7d32;">
              Score: ${score}
            </span>
          `
              : ""
          }
        </div>
        ${
          problem.tags && problem.tags.length
            ? `
          <div class="problem-tags">
            ${problem.tags.map((tag) => `<span class="tag">${this.escapeHTML(tag)}</span>`).join("")}
          </div>
        `
            : ""
        }
      </div>
    </div>
    
    ${
      problem.timeComplexity || problem.spaceComplexity
        ? `
      <div class="problem-meta">
        ${problem.timeComplexity ? `<span>⏱️ Time: ${this.escapeHTML(problem.timeComplexity)}</span>` : ""}
        ${problem.spaceComplexity ? `<span>💾 Space: ${this.escapeHTML(problem.spaceComplexity)}</span>` : ""}
        ${lastSolvedDate ? `<span>Last solved: ${lastSolvedDate}</span>` : ""}
      </div>
    `
        : ""
    }
    
    <div class="problem-actions">
      <button class="solution-btn ${hasSolution ? "primary" : ""}" onclick="window.app.toggleSolution('${solutionId}')">
        ${hasSolution ? "View Solution" : "Add Solution"}
      </button>
      <button class="solution-btn warning" onclick="window.app.editProblem('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}')">
        Edit
      </button>
      <button class="solution-btn success" onclick="window.app.markAsSolved('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}')">
        Mark Solved
      </button>
      <button class="solution-btn danger" onclick="window.app.deleteProblem('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}')">
        Delete
      </button>
    </div>
    
    <div class="solution-content" id="${solutionId}">
      ${
        hasSolution
          ? `
        <div class="solution-code">${this.escapeHTML(problem.solution)}</div>
        ${
          problem.notes
            ? `
          <div class="problem-notes">
            <strong>Notes:</strong><br>${this.escapeHTML(problem.notes)}
          </div>
        `
            : ""
        }
      `
          : `
        <textarea class="solution-textarea"
                   placeholder="Paste your solution here..."
                   onblur="window.app.quickSaveSolution('${this.escapeHTML(topic)}', '${this.escapeHTML(problem.title)}', this.value)"></textarea>
      `
      }
    </div>
  `

    return problemCard
  }

  // Analytics Page
  loadAnalytics() {
    const analyticsContent = document.getElementById("analyticsContent")
    if (!analyticsContent) return

    const analyticsHTML = this.generateDetailedAnalytics()
    analyticsContent.innerHTML = analyticsHTML
  }

  generateDetailedAnalytics() {
    let html = '<div class="analytics-sections">'

    // Topic-wise progress
    html += `
    <div class="dashboard-section">
      <h3>📊 Topic-wise Progress</h3>
      <div class="analytics-grid">
  `

    Object.entries(this.problemsData).forEach(([topic, problems]) => {
      const total = problems.length
      const solved = problems.filter((p) => p.solution && p.solution.trim()).length
      const percentage = total > 0 ? Math.round((solved / total) * 100) : 0

      // Difficulty breakdown
      const difficulties = { Easy: 0, Medium: 0, Hard: 0 }
      const solvedDifficulties = { Easy: 0, Medium: 0, Hard: 0 }

      problems.forEach((problem) => {
        const diff = problem.difficulty || "Easy"
        difficulties[diff]++
        if (problem.solution && problem.solution.trim()) {
          solvedDifficulties[diff]++
        }
      })

      html += `
      <div class="analytics-card">
        <div class="analytics-card-header">
          <h4>${this.escapeHTML(topic)}</h4>
          <span class="analytics-percentage">${percentage}%</span>
        </div>
        <div class="analytics-progress">
          <div class="analytics-progress-bar">
            <div class="analytics-progress-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="analytics-stats">
            <span>${solved}/${total} solved</span>
          </div>
        </div>
        <div class="analytics-breakdown">
          <div class="breakdown-item">
            <span class="breakdown-label">Easy:</span>
            <span class="breakdown-value">${solvedDifficulties.Easy}/${difficulties.Easy}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Medium:</span>
            <span class="breakdown-value">${solvedDifficulties.Medium}/${difficulties.Medium}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Hard:</span>
            <span class="breakdown-value">${solvedDifficulties.Hard}/${difficulties.Hard}</span>
          </div>
        </div>
      </div>
    `
    })

    html += `
      </div>
    </div>
  `

    // Overall statistics
    let totalProblems = 0
    let solvedProblems = 0
    let totalScore = 0
    const difficultyStats = {
      Easy: { total: 0, solved: 0 },
      Medium: { total: 0, solved: 0 },
      Hard: { total: 0, solved: 0 },
    }

    Object.values(this.problemsData).forEach((problems) => {
      problems.forEach((problem) => {
        totalProblems++
        const diff = problem.difficulty || "Easy"
        difficultyStats[diff].total++

        if (problem.solution && problem.solution.trim()) {
          solvedProblems++
          difficultyStats[diff].solved++
        }
        totalScore += this.calculateProblemScore(problem)
      })
    })

    html += `
    <div class="dashboard-section">
      <h3>📈 Overall Statistics</h3>
      <div class="overall-stats">
        <div class="stat-row">
          <span class="stat-label">Total Problems:</span>
          <span class="stat-value">${totalProblems}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Solved Problems:</span>
          <span class="stat-value">${solvedProblems}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Success Rate:</span>
          <span class="stat-value">${totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Score:</span>
          <span class="stat-value">${totalScore}</span>
        </div>
      </div>
      
      <h4 style="margin: 1.5rem 0 1rem 0;">Difficulty Breakdown</h4>
      <div class="difficulty-breakdown">
        ${Object.entries(difficultyStats)
          .map(
            ([diff, stats]) => `
          <div class="difficulty-stat">
            <div class="difficulty-stat-header">
              <span class="difficulty-badge difficulty-${diff.toLowerCase()}">${diff}</span>
              <span>${stats.solved}/${stats.total}</span>
            </div>
            <div class="difficulty-progress">
              <div class="difficulty-progress-fill" style="width: ${stats.total > 0 ? (stats.solved / stats.total) * 100 : 0}%"></div>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `

    html += "</div>"

    // Add CSS for analytics
    html += `
    <style>
      .analytics-sections {
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }
      
      .analytics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
      }
      
      .analytics-card {
        background: var(--background);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1.5rem;
      }
      
      .analytics-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }
      
      .analytics-card-header h4 {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
      }
      
      .analytics-percentage {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--primary-color);
      }
      
      .analytics-progress {
        margin-bottom: 1rem;
      }
      
      .analytics-progress-bar {
        width: 100%;
        height: 8px;
        background: var(--border);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 0.5rem;
      }
      
      .analytics-progress-fill {
        height: 100%;
        background: var(--success-color);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      
      .analytics-stats {
        text-align: center;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }
      
      .analytics-breakdown {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      
      .breakdown-item {
        display: flex;
        justify-content: space-between;
        font-size: 0.9rem;
      }
      
      .breakdown-label {
        color: var(--text-secondary);
      }
      
      .breakdown-value {
        color: var(--text-primary);
        font-weight: 500;
      }
      
      .overall-stats {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }
      
      .stat-row {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border);
      }
      
      .stat-row:last-child {
        border-bottom: none;
      }
      
      .stat-label {
        color: var(--text-secondary);
        font-weight: 500;
      }
      
      .stat-value {
        color: var(--text-primary);
        font-weight: 600;
      }
      
      .difficulty-breakdown {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      
      .difficulty-stat {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      
      .difficulty-stat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .difficulty-progress {
        width: 100%;
        height: 6px;
        background: var(--border);
        border-radius: 3px;
        overflow: hidden;
      }
      
      .difficulty-progress-fill {
        height: 100%;
        background: var(--primary-color);
        border-radius: 3px;
        transition: width 0.3s ease;
      }
    </style>
  `

    return html
  }

  // Override the buildWebsite method to use the new system
  buildWebsite() {
    // This method is now handled by individual page loaders
    // Keep for backward compatibility but redirect to appropriate page
    this.buildProblemsView()
  }

  // Update the showApp method to show dashboard by default
  async showApp() {
    const loginContainer = document.getElementById("loginContainer")
    const appContainer = document.getElementById("appContainer")
    const loadingOverlay = document.getElementById("loadingOverlay")

    if (loginContainer) loginContainer.style.display = "none"
    if (loadingOverlay) loadingOverlay.style.display = "flex"

    try {
      await this.initializeApp()
      if (appContainer) appContainer.classList.add("show")

      const currentUserElement = document.getElementById("currentUser")
      if (currentUserElement) {
        currentUserElement.textContent = this.currentUser
      }

      // Show dashboard by default
      this.showPage("dashboard")
    } catch (error) {
      console.error("Error initializing app:", error)
      this.showToast("Error loading data. Please try again.", "error")
    } finally {
      if (loadingOverlay) loadingOverlay.style.display = "none"
    }
  }

  async initializeFirebase() {
    await fetchFirebaseConfig()
  }
}

// Add CSS for import summary
const importSummaryCSS = `
.import-summary {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 1rem;
    border: 1px solid var(--border);
}

.summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
}

.summary-item:last-child {
    border-bottom: none;
}

.summary-label {
    font-weight: 500;
    color: var(--text-primary);
}

.summary-value {
    font-weight: 600;
    font-size: 1.1rem;
}

.summary-item.success .summary-value {
    color: var(--success-color);
}

.summary-item.warning .summary-value {
    color: var(--warning-color);
}

.summary-item.info .summary-value {
    color: var(--primary-color);
}

.summary-item.error .summary-value {
    color: var(--error-color);
}
`

// Add the CSS to the document
const style = document.createElement("style")
style.textContent = importSummaryCSS
document.head.appendChild(style)

// Initialize the app
window.app = new DSATracker()

// Global functions for onclick handlers
window.toggleTheme = () => window.app.toggleTheme()
window.logout = () => window.app.logout()
window.fillDemo = (username, password) => window.app.fillDemo(username, password)
window.showAnalytics = () => window.app.showAnalytics()
window.showGoals = () => window.app.showGoals()
window.closeGoalsModal = () => window.app.closeGoalsModal()
window.saveGoals = () => window.app.saveGoals()
window.downloadJSON = () => window.app.downloadJSON()
window.addProblem = () => window.app.addProblem()
window.closeModal = () => window.app.closeModal()
window.filterByTopic = () => window.app.filterByTopic()
window.filterByTag = () => window.app.filterByTag()
window.filterByStatus = () => window.app.filterByStatus()
window.filterByDifficulty = (button, difficulty) => window.app.filterByDifficulty(button, difficulty)
window.clearSearch = () => window.app.clearSearch()
