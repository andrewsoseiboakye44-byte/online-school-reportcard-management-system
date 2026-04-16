/**
 * Dynamic Background Slider
 * This script automatically loads images from the background folder and professionally animates them.
 * To add more pictures later, simply add their paths to the bgImages array!
 */
const bgImages = [
    'images/background images/back1.jpg',
    'images/background images/back2.jpg',
    'images/background images/back3.jpg'
];

function initBgSlider() {
    const containers = document.querySelectorAll('.bg-slider-target');
    
    if (containers.length === 0) return;

    containers.forEach(container => {
        // Build the dom structure inside the target
        const sliderDiv = document.createElement('div');
        sliderDiv.className = 'bg-slider-container';
        
        bgImages.forEach((src, index) => {
            const img = document.createElement('div');
            img.className = `bg-slide ${index === 0 ? 'active' : ''}`;
            img.style.backgroundImage = `url('${src}')`;
            sliderDiv.appendChild(img);
        });

        const overlay = document.createElement('div');
        overlay.className = 'bg-overlay';
        
        container.appendChild(sliderDiv);
        container.appendChild(overlay);

        // Animation logic
        let currentIndex = 0;
        const slides = sliderDiv.querySelectorAll('.bg-slide');

        if (slides.length > 1) {
            setInterval(() => {
                slides[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % slides.length;
                slides[currentIndex].classList.add('active');
            }, 5000); // Change image every 5 seconds
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initBgSlider();
});
