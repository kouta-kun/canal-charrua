import './style.css'
import {sha256} from 'js-sha256';

type Message = {
    id: number;
    subject: string | null;
    content: string;
    submission_date: number;
    poster_id: string;
    image_id: string | null;
    bot_acc: string | null;
};

type Thread = Message & {
    children: Message[];
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

function create_message(message: Message, child_of: HTMLDivElement, parent_id: number) {
    const clone = (document.getElementById("template:message") as HTMLTemplateElement).content.cloneNode(true) as HTMLElement;
    (clone.querySelector<HTMLSpanElement>(".datetime"))!.innerText = processDate(message.submission_date);
    const contentDiv = (clone.querySelector<HTMLDivElement>(".content"))!;
    processMessageContent(contentDiv, message);
    const posterId = (clone.querySelector<HTMLDivElement>(".posterid"))!;
    if (message.bot_acc !== null) {
        posterId.innerText = "Bot("+message.bot_acc+")"
    } else
        posterId.innerText = message.poster_id;
    const subjectBar = (clone.querySelector<HTMLDivElement>(".subjectbar"))!;
    subjectBar.innerText = (message.subject ?? "") + " #"+message.id;
    subjectBar.id = message.id+"";
    (clone.querySelector<HTMLButtonElement>(".replybutton"))!.addEventListener("click", setup_message_send.bind(null, parent_id, ">>"+message.id+"\n"));
    if (message.image_id !== null) {
        clone.querySelector<HTMLImageElement>(".image")!.src = APIPath + "/api/image/"+message.image_id;
    }
    child_of.appendChild(clone);
}


const APIPath = "http://localhost:8000";

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
    challenge_to_send = await fetch(APIPath + "/api/challenge").then(r => r.json()) as Challenge;
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
            link.href = "#" + refmatch.slice(2);
            link.innerText = refmatch;
            contentDiv.append(link);
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

function create_thread(thread: Thread, child_of: HTMLDivElement) {
    const clone = (document.getElementById("template:thread") as HTMLTemplateElement).content.cloneNode(true) as HTMLElement;
    (clone.querySelector<HTMLSpanElement>(".datetime"))!.innerText = processDate(thread.submission_date);
    const contentDiv = (clone.querySelector<HTMLDivElement>(".content"))!;
    processMessageContent(contentDiv, thread);
    const subjectBar = (clone.querySelector<HTMLDivElement>(".subjectbar-thread"))!;
    subjectBar.innerText = (thread.subject ?? "") + " #"+thread.id;
    subjectBar.id = thread.id+"";
    (clone.querySelector<HTMLButtonElement>(".replybutton"))!.addEventListener("click", setup_message_send.bind(null, thread.id, ">>"+thread.id+"\n"));
    (clone.querySelector<HTMLDivElement>(".posterid"))!.innerText = thread.poster_id;
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
    fetch(APIPath + "/api/post", {
        body: JSON.stringify(message_to_send),
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'POST'
    }).then(r => r.json()).then(() => window.document.location.reload());
}

(document.getElementById("sendmsgbtn") as HTMLDialogElement).addEventListener("click", sendMessage);

(document.getElementById("new-thread") as HTMLDialogElement).addEventListener("click", setup_message_send.bind(null, null, null));

fetch(APIPath + "/api/threads").then(r => r.json()).then(r => r as Thread[]).then(r => {
    r.forEach(t => create_thread(t, document.getElementById("threads") as HTMLDivElement))
})