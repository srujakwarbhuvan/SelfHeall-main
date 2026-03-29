// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Subtle parallax effect for floating orbs
document.addEventListener('mousemove', (e) => {
    const spots = document.querySelectorAll('.bg-gradient-spot');
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;

    spots.forEach((spot, index) => {
        const speed = (index + 1) * 20;
        const xOffset = (window.innerWidth / 2 - e.pageX) / speed;
        const yOffset = (window.innerHeight / 2 - e.pageY) / speed;
        
        spot.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    });
});

// Typewriter effect for the mock IDE chat
const chatText = "I found the root cause! The variable `token` is deeply nested but undefined here. I recommend adding optional chaining. \n\nconst auth = req?.headers?.token;";
const aiMsgElement = document.querySelector('.ai-msg');

let i = 0;
let isTyping = false;

// Simple intersection observer to trigger typing animation when scrolled into view
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !isTyping) {
            isTyping = true;
            aiMsgElement.innerHTML = '<strong>SelfHeal AI:</strong> ';
            typeWriter();
        }
    });
}, { threshold: 0.5 });

const panel = document.querySelector('.glass-panel');
if (panel) observer.observe(panel);

function typeWriter() {
    if (i < chatText.length) {
        if (chatText.charAt(i) === '\n') {
            aiMsgElement.innerHTML += '<br/>';
        } else {
            aiMsgElement.innerHTML += chatText.charAt(i);
        }
        i++;
        setTimeout(typeWriter, 15);
    } else {
        // Format the code block after typing is done
        aiMsgElement.innerHTML = aiMsgElement.innerHTML.replace('const auth = req?.headers?.token;', '<code>const auth = req?.headers?.token;</code>');
    }
}
