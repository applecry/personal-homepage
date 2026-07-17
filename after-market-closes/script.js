const moods = {
  loss: {
    title: "我亏钱了",
    response:
      "损失带来的不只是数字变化，也可能是懊悔、羞耻和失控感。难受不代表你脆弱，今晚也不必马上把这些想清楚。",
  },
  regret: {
    title: "我很后悔",
    response:
      "当时的你，只能用当时拥有的信息做决定。复盘可以留到情绪平静以后，今晚先不要把结果全部变成对自己的责备。",
  },
  future: {
    title: "我害怕未来",
    response:
      "不确定会把最坏的可能放得很大。你不需要今晚解决未来，只需要照顾好接下来的一个小时。",
  },
  quiet: {
    title: "我不想说话",
    response:
      "可以不解释，也可以什么都不想。在这里坐一会儿就好，没有人要求你立刻振作起来。",
  },
};

const moodPicker = document.querySelector("[data-mood-picker]");
const moodResponse = document.querySelector("[data-mood-response]");
const responseTitle = document.querySelector("[data-response-title]");
const responseCopy = document.querySelector("[data-response-copy]");

document.querySelectorAll("[data-mood]").forEach((button) => {
  button.addEventListener("click", () => {
    const mood = moods[button.dataset.mood];
    if (!mood) return;
    responseTitle.textContent = mood.title;
    responseCopy.textContent = mood.response;
    moodPicker.hidden = true;
    moodResponse.hidden = false;
  });
});

document.querySelector("[data-mood-back]").addEventListener("click", () => {
  moodResponse.hidden = true;
  moodPicker.hidden = false;
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.scroll)?.scrollIntoView({
      behavior: "smooth",
    });
  });
});

const windowWall = document.querySelector("[data-window-wall]");
for (let index = 0; index < 42; index += 1) {
  const light = document.createElement("i");
  if (index % 3 === 0 || index % 8 === 0) light.className = "lit";
  windowWall.append(light);
}

const quietRoom = document.querySelector("[data-quiet-room]");
const roomToggle = document.querySelector("[data-room-toggle]");
const timerLabel = document.querySelector("[data-timer]");
let remaining = 300;
let timer = null;

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderTimer() {
  timerLabel.textContent = remaining === 0 ? "今晚先到这里" : formatTime(remaining);
}

function stopRoom() {
  window.clearInterval(timer);
  timer = null;
  quietRoom.classList.remove("is-active");
}

roomToggle.addEventListener("click", () => {
  if (timer) {
    stopRoom();
    roomToggle.textContent = "继续坐一会儿";
    return;
  }

  if (remaining === 0) remaining = 300;
  quietRoom.classList.add("is-active");
  roomToggle.textContent = "暂时离开";
  renderTimer();
  timer = window.setInterval(() => {
    remaining -= 1;
    renderTimer();
    if (remaining <= 0) {
      stopRoom();
      roomToggle.textContent = "再坐五分钟";
    }
  }, 1000);
});

const decisionForm = document.querySelector("[data-decision-form]");
const decisionInput = document.querySelector("[data-decision]");
const saveDecision = document.querySelector("[data-save-decision]");
const savedState = document.querySelector("[data-saved-state]");
const savedDelay = document.querySelector("[data-saved-delay]");
let delay = 24;

decisionInput.addEventListener("input", () => {
  saveDecision.disabled = !decisionInput.value.trim();
});

document.querySelectorAll("[data-delay]").forEach((button) => {
  button.addEventListener("click", () => {
    delay = Number(button.dataset.delay);
    document.querySelectorAll("[data-delay]").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  });
});

decisionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = decisionInput.value.trim();
  if (!text) return;

  try {
    window.localStorage.setItem(
      "after-market-decision",
      JSON.stringify({
        text,
        reopenAt: new Date(Date.now() + delay * 60 * 60 * 1000).toISOString(),
      }),
    );
  } catch {
    // The quiet-room interaction still works when storage is unavailable.
  }

  savedDelay.textContent = String(delay);
  decisionForm.hidden = true;
  savedState.hidden = false;
});

document.querySelector("[data-reset-decision]").addEventListener("click", () => {
  decisionInput.value = "";
  saveDecision.disabled = true;
  savedState.hidden = true;
  decisionForm.hidden = false;
  decisionInput.focus();
});
