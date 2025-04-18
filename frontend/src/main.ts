import './style.css'
import {sha256} from 'js-sha256';
import {flag} from 'country-emoji';
let userIp: string = "";

type Message = {
    id: number;
    subject: string | null;
    content: string;
    submission_date: number;
    poster_id: string;
    image_id: string | null;
    country: string;
};

type Thread = Message & {
    children: Message[];
    sticky: boolean;
};

type SentMessage = Pick<Message, "content" | "subject" | "image_id"> & {
    parent: number | null;
    challenge_id: number;
    challenge_result: string;
};

const message_to_send: SentMessage = {
    content: "",
    subject: "",
    challenge_id: 0,
    challenge_result: "",
    parent: null,
    image_id: null,
}

type Challenge = {
    challenge_id: number;
    input: string;
    rounds: number;
};

let challenge_to_send: Challenge | null = null;

function processDate(submissionDate: number) {
    return new Date(submissionDate).toLocaleString();
}

function calculateId(parent_id: number) {
    const hash = sha256.create();
    hash.update(userIp);
    hash.update(parent_id+"");
    const hd = hash.hex();
    return btoa(hd.slice(hd.length-6));
}

const yourMessages: number[] = [];

function create_message(message: Message, child_of: HTMLDivElement, parent_id: number) {
    const clone = (document.getElementById("template:message") as HTMLTemplateElement).content.cloneNode(true) as HTMLElement;
    (clone.querySelector<HTMLSpanElement>(".datetime"))!.innerText = processDate(message.submission_date);
    const posterId = (clone.querySelector<HTMLDivElement>(".posterid"))!;
    posterId.innerText = message.poster_id;
    const yourId = calculateId(parent_id);
    if (message.poster_id === yourId) {
        posterId.innerText += " (Vos)";
        yourMessages.push(message.id);
    }
    (clone.querySelector<HTMLSpanElement>(".country"))!.innerText = flag(message.country) ?? "?";
    const contentDiv = (clone.querySelector<HTMLDivElement>(".content"))!;
    processMessageContent(contentDiv, message);
    const parentDiv = clone.querySelector<HTMLDivElement>('.message')!;
    parentDiv.id = message.id+"";
    const subjectBar = (clone.querySelector<HTMLDivElement>(".subjectbar"))!;
    subjectBar.innerText = (message.subject ?? "") + " #"+message.id;
    (clone.querySelector<HTMLButtonElement>(".replybutton"))!.addEventListener("click", setup_message_send.bind(null, parent_id, ">>"+message.id+"\n"));
    if (message.image_id !== null) {
        clone.querySelector<HTMLImageElement>(".image")!.src = APIPath + "/api/image/"+message.image_id;
    }
    child_of.appendChild(clone);
}

const isLocalDevelopment = window.location.host.includes('localhost') || window.location.host.includes('127.0.0.1');
const APIPath = isLocalDevelopment ? "http://localhost:8000" : "https://koutarou.uy/betumhue";

async function refreshChallenge() {
    challenge_to_send = await fetch(APIPath + "/api/challenge").then(r => r.json()) as Challenge;
}

async function setup_message_send(parent_id: number | null, starting_text: string | null) {
    const dialog = document.getElementById("reply-dialog") as HTMLDialogElement;
    message_to_send.parent = parent_id;
    message_to_send.content = "";
    message_to_send.subject = null;
    message_to_send.challenge_id = 0;
    message_to_send.challenge_result = "";
    if (starting_text !== null) {
        (document.getElementById("content") as HTMLTextAreaElement).value = starting_text;
    }
    await refreshChallenge();
    dialog.show();
}

function processMessageContent(contentDiv: HTMLDivElement, message: Message) {
    contentDiv.innerText = "";
    let content = message.content;
    const linkregex = /(https?:\/\/[^\s]+)|(>>\d+)|(>.+)|\n/;
    let regexresult: RegExpExecArray | null = null;
    while ((regexresult = linkregex.exec(content)) !== null) {
        const [matchedText, linkmatch, refmatch, greentextmatch] = regexresult;
        const matchStart = regexresult.index;
        const textBefore = content.slice(0, matchStart);
        contentDiv.append(textBefore);
        if (linkmatch !== undefined) {
            const link = document.createElement("a");
            link.href = linkmatch;
            link.innerText = linkmatch;
            contentDiv.append(link);
        } else if (refmatch !== undefined) {
            const link = document.createElement("a");
            const refId = Number.parseInt(refmatch.slice(2));
            link.href = "#" + refId;
            link.innerText = refmatch;
            if (yourMessages.includes(+refId)) {
                link.innerText += " (Vos)"
            }
            contentDiv.append(link);
            add_reply(refId, message.id);
        } else if (greentextmatch !== undefined) {
            const span = document.createElement("span");
            span.innerText = greentextmatch;
            span.className = "greentext";
            contentDiv.append(span);
        } else if (matchedText == '\n') {
            contentDiv.append(document.createElement("br"));
        }
        content = content.slice(matchStart + matchedText.length);
    }
    if (content.length > 0) {
        contentDiv.append(content);
    }
}

const replies: [number, number][] = [];

function add_reply(to: number, message_id: number) {
    replies.push([to, message_id]);
}

function process_reply(to: number, message_id: number) {
    const replyList = document.getElementById(""+to)?.querySelector<HTMLDivElement>(".replylist");
    if (replyList === null || replyList === undefined) throw new Error("couldn't find replylist element");
    if (!replyList.hasChildNodes()) {
        const resp = document.createElement("span");
        resp.innerText = "Respuestas: "
        replyList.append(document.createElement("br"), resp);
    }

    const link = document.createElement("a");
    link.href = "#" + message_id;
    link.innerText = ">>"+message_id;

    replyList.append(link);
    const skip = document.createElement("span");
    skip.innerText = " ";
    replyList.append(skip);
}

function process_all_replies() {
    for(const [to, msgid] of replies) {
        process_reply(to, msgid);
    }
    replies.length = 0;
}

function create_thread(thread: Thread, child_of: HTMLDivElement) {
    const clone = (document.getElementById("template:thread") as HTMLTemplateElement).content.cloneNode(true) as HTMLElement;
    (clone.querySelector<HTMLSpanElement>(".datetime"))!.innerText = processDate(thread.submission_date);
    const posterId = (clone.querySelector<HTMLDivElement>(".posterid"))!;
    posterId.innerText = thread.poster_id;
    const yourId = calculateId(thread.id);
    if (thread.poster_id === yourId) {
        posterId.innerText += " (Vos)";
        yourMessages.push(thread.id);
    }
    const contentDiv = (clone.querySelector<HTMLDivElement>(".content"))!;
    processMessageContent(contentDiv, thread);
    const subjectBar = (clone.querySelector<HTMLDivElement>(".subjectbar-thread"))!;
    subjectBar.innerText = (thread.subject ?? "") + " #"+thread.id;
    if (thread.sticky) {
        subjectBar.innerText += ' 📌'
    }
    const parentDiv = clone.querySelector<HTMLDivElement>('.thread')!;
    parentDiv.id = thread.id+"";
    (clone.querySelector<HTMLSpanElement>(".country"))!.innerText = flag(thread.country) ?? "?";
    (clone.querySelector<HTMLButtonElement>(".replybutton"))!.addEventListener("click", setup_message_send.bind(null, thread.id, ">>"+thread.id+"\n"));
    if (thread.image_id !== null) {
        clone.querySelector<HTMLImageElement>(".image")!.src = APIPath + "/api/image/"+thread.image_id;
    }
    let childrenElement = clone.querySelector<HTMLDivElement>(".children")!;
    thread.children.forEach(message => create_message(message, childrenElement, thread.id));
    child_of.appendChild(clone);
}

function processChallenge(challenge: Challenge): string {
    let hash_string = challenge.input;
    for(let i = 0; i < challenge.rounds; i++) {
        hash_string = sha256(hash_string);
    }
    return hash_string;
}

async function sendMessage() {
    const fileInput = document.getElementById("file") as HTMLInputElement;
    let imageId = null;
    if (fileInput.files !== null && fileInput.files.length > 0) {
        const image = fileInput.files[0];
        const formData = new FormData();
        formData.append("file", image);
        imageId = (await fetch(APIPath + "/api/file-upload", {method:"POST",body:formData}).then(r => r.json()).then(r => r as {id: string})).id;
        fileInput.value = '';
    }
    message_to_send.subject = (document.getElementById("subject") as HTMLInputElement).value;
    message_to_send.content = (document.getElementById("content") as HTMLTextAreaElement).value;
    message_to_send.challenge_id = challenge_to_send!.challenge_id;
    message_to_send.challenge_result = processChallenge(challenge_to_send!);
    message_to_send.image_id = imageId;
    (document.getElementById("subject") as HTMLInputElement).value="";
    (document.getElementById("content") as HTMLTextAreaElement).value="";
    const response = await fetch(APIPath + "/api/post", {
        body: JSON.stringify(message_to_send),
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'POST'
    });
    const json = await response.json();
    if (response.status >= 300) {
        const {detail} = json as {detail: string};
        document.querySelector<HTMLParagraphElement>(".error")!.innerText = detail;
        await refreshChallenge(); // probablemente invalidado antes del error. solicitar nuevo.
    } else {
        window.scrollTo(0, 0);
        window.document.location.reload();
    }
}

(document.getElementById("sendmsgbtn") as HTMLDialogElement).addEventListener("click", sendMessage);

(document.getElementById("new-thread") as HTMLDialogElement).addEventListener("click", setup_message_send.bind(null, null, null));

async function getIp() {
    let ipstore: string | null;
    if ((ipstore = window.localStorage.getItem('myip')) !== null) {
        const [ip, time] = JSON.parse(ipstore);
        if ((Date.now() - time) < 1000 * 60 * 30) {
            userIp = ip;
            return;
        }
    }
    try {
        await fetch('https://api.ipify.org?format=json').then(r => r.json()).then(({ip}) => {
            userIp = ip;
            window.localStorage.setItem('myip', JSON.stringify([ip, Date.now()]));
        }).catch(() => userIp = "");
    } catch (e) {
    }
}

const threadElements = document.getElementById("threads") as HTMLDivElement;

async function loadPage(page: number) {
    await fetch(APIPath + "/api/threads?page=" + page).then(r => r.json()).then(r => r as Thread[]).then(r => {
        threadElements.replaceChildren();
        r.forEach(t => create_thread(t, threadElements))
    });
    process_all_replies();
}

async function loadPageCount() {
    const response = await fetch(APIPath + "/api/pagecount");
    const {count} = (await response.json()) as {count: number};
    const pageselCollection = document.getElementsByClassName("pagesel") as HTMLCollectionOf<HTMLDivElement>;
    for (const pagesel of pageselCollection) {
        pagesel.append('[')
        for(let i = 0; i < count; i++) {
            const btn = document.createElement("button");
            btn.className = "replybutton";
            btn.innerText = (i+1)+"";
            btn.addEventListener('click', loadPage.bind(null, i));
            pagesel.append(btn);
            if (i !== count - 1) {
                pagesel.append("/");
            }
        }
        pagesel.append(']')
    }
}

async function init() {
    await getIp();
    await loadPage(0);
    await loadPageCount();
}

init();
