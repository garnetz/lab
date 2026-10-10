# The states between the words

A small playable study of the moments an AI product spends not answering yet. The same question and the same wait are shown two ways, side by side: a bare spinner, and a designed set of states. Set the delay, pick what goes wrong, ask, and feel which one you would trust.

## The design

- **Same time, honestly.** Both sides share one plan: the same delay, the same word pace and the same failure point. The bare side waits for the whole answer, so it finishes at exactly the moment the designed side does. Only the experience differs. A timeline under each side shows where the time went.
- **Show you heard.** The question lands at once and something moves within a beat.
- **Explain the wait.** Under a second it stays quiet. After one second it says "Thinking", after three "Still working on it", after six it says it's slow and points at Stop.
- **Give it as it comes.** Streaming turns waiting into reading. Stop is always one tap away and keeps what arrived, with a way to continue.
- **Fail without loss.** When it fails, the question stays. When it drops mid-answer, the partial answer stays and the retry picks up where it stopped. The bare side loses both.

## How it works

One file, `index.html`, with no libraries and no build step. Nothing calls a model: the answers are canned, because the point is how the wait feels, not what is said. Motion is switched off for people who ask their system for reduced motion.

## Run it

Open `index.html` in a browser. To put it online, any static host works.

## Make it yours

- Change the questions and answers in `QA` at the top of the script.
- Change the thinking copy and its timing in `ESCALATE`.
