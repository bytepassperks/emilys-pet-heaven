// ===== EMILY PET'S HEAVEN - ANIMATIONS JAVASCRIPT =====

document.addEventListener('DOMContentLoaded', function() {
  // Initialize all animation components
  initScrollAnimations();
  initParallaxEffects();
  initCounterAnimations();
  initRevealOnScroll();
  initTiltEffect('.service-card, .pricing-card, .blog-card-small');
});

// ===== REVEAL ON SCROLL INITIALIZATION =====
function initRevealOnScroll() {
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  
  if (revealElements.length === 0) return;
  
  // Immediately reveal elements already in viewport (above fold)
  const viewportHeight = window.innerHeight;
  revealElements.forEach(function(el) {
    var rect = el.getBoundingClientRect();
    if (rect.top < viewportHeight + 50) {
      el.classList.add('revealed');
    }
  });
  
  // Enable scroll-based reveal animations for below-fold elements
  document.documentElement.classList.add('js-reveal-ready');
  
  var observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  };
  
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  revealElements.forEach(function(element) {
    if (!element.classList.contains('revealed')) {
      observer.observe(element);
    }
  });
}

// ===== SCROLL-TRIGGERED ANIMATIONS =====
function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('.scroll-animate');
  
  if (animatedElements.length === 0) return;

  // Check if Intersection Observer is supported
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          // Optionally unobserve after animation
          // observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    animatedElements.forEach(element => {
      observer.observe(element);
    });
  } else {
    // Fallback for older browsers
    animatedElements.forEach(element => {
      element.classList.add('animated');
    });
  }
}

// ===== PARALLAX EFFECTS =====
function initParallaxEffects() {
  const parallaxElements = document.querySelectorAll('[data-parallax]');
  
  if (parallaxElements.length === 0) return;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  function updateParallax() {
    const scrollY = window.pageYOffset;

    parallaxElements.forEach(element => {
      const speed = parseFloat(element.dataset.parallax) || 0.5;
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + scrollY;
      const offset = (scrollY - elementTop) * speed;

      element.style.transform = `translateY(${offset}px)`;
    });
  }

  // Throttled scroll handler
  let ticking = false;
  window.addEventListener('scroll', function() {
    if (!ticking) {
      window.requestAnimationFrame(function() {
        updateParallax();
        ticking = false;
      });
      ticking = true;
    }
  });
}

// ===== COUNTER ANIMATIONS =====
function initCounterAnimations() {
  const counters = document.querySelectorAll('[data-counter]');
  
  if (counters.length === 0) return;

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.5
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
        animateCounter(entry.target);
        entry.target.classList.add('counted');
      }
    });
  }, observerOptions);

  counters.forEach(counter => {
    observer.observe(counter);
  });
}

function animateCounter(element) {
  const target = parseInt(element.dataset.counter, 10);
  const duration = parseInt(element.dataset.duration, 10) || 2000;
  const suffix = element.dataset.suffix || '';
  const prefix = element.dataset.prefix || '';
  
  let startTime = null;
  const startValue = 0;

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function updateCounter(currentTime) {
    if (!startTime) startTime = currentTime;
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutQuart(progress);
    const currentValue = Math.floor(startValue + (target - startValue) * easedProgress);

    element.textContent = prefix + currentValue.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }

  requestAnimationFrame(updateCounter);
}

// ===== TYPING ANIMATION =====
function initTypingAnimation() {
  const typingElements = document.querySelectorAll('[data-typing]');
  
  typingElements.forEach(element => {
    const text = element.dataset.typing;
    const speed = parseInt(element.dataset.speed, 10) || 100;
    let index = 0;

    element.textContent = '';
    element.style.borderRight = '2px solid var(--color-primary)';

    function type() {
      if (index < text.length) {
        element.textContent += text.charAt(index);
        index++;
        setTimeout(type, speed);
      } else {
        // Remove cursor after typing is complete
        setTimeout(() => {
          element.style.borderRight = 'none';
        }, 1000);
      }
    }

    // Start typing when element is in view
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          type();
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    observer.observe(element);
  });
}

// ===== STAGGERED ANIMATION HELPER =====
function animateStaggered(elements, animationClass, delay = 100) {
  elements.forEach((element, index) => {
    setTimeout(() => {
      element.classList.add(animationClass);
    }, index * delay);
  });
}

// ===== REVEAL ON SCROLL =====
function revealOnScroll(selector, options = {}) {
  const elements = document.querySelectorAll(selector);
  
  const defaultOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
    animationClass: 'revealed',
    stagger: false,
    staggerDelay: 100
  };

  const config = { ...defaultOptions, ...options };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        if (config.stagger) {
          setTimeout(() => {
            entry.target.classList.add(config.animationClass);
          }, index * config.staggerDelay);
        } else {
          entry.target.classList.add(config.animationClass);
        }
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: config.threshold,
    rootMargin: config.rootMargin
  });

  elements.forEach(element => {
    observer.observe(element);
  });
}

// ===== SVG PATH ANIMATION =====
function animateSVGPath(svgElement) {
  const paths = svgElement.querySelectorAll('path');
  
  paths.forEach(path => {
    const length = path.getTotalLength();
    
    // Set up the starting position
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    
    // Trigger animation
    path.style.transition = 'stroke-dashoffset 2s ease-in-out';
    path.style.strokeDashoffset = '0';
  });
}

// ===== MOUSE FOLLOW EFFECT =====
function initMouseFollow(selector) {
  const element = document.querySelector(selector);
  if (!element) return;

  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    
    element.style.transform = `translate(${x}px, ${y}px)`;
  });
}

// ===== TILT EFFECT ON CARDS =====
function initTiltEffect(selector) {
  const cards = document.querySelectorAll(selector);
  
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = (y - centerY) / 10;
      const rotateY = (centerX - x) / 10;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    });
  });
}

// ===== MAGNETIC BUTTON EFFECT =====
function initMagneticButtons(selector) {
  const buttons = document.querySelectorAll(selector);
  
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  buttons.forEach(button => {
    button.addEventListener('mousemove', (e) => {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      button.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translate(0, 0)';
    });
  });
}

// ===== SCROLL PROGRESS INDICATOR =====
function initScrollProgress() {
  const progressBar = document.querySelector('.scroll-progress');
  if (!progressBar) return;

  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    
    progressBar.style.width = `${progress}%`;
  });
}

// ===== LAZY LOAD IMAGES =====
function initLazyLoad() {
  const lazyImages = document.querySelectorAll('img[data-src]');
  
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.classList.add('loaded');
          imageObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '50px 0px'
    });

    lazyImages.forEach(img => {
      imageObserver.observe(img);
    });
  } else {
    // Fallback for older browsers
    lazyImages.forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  }
}

// ===== EXPORT FUNCTIONS FOR GLOBAL USE =====
window.AnimationUtils = {
  animateStaggered,
  revealOnScroll,
  animateSVGPath,
  initMouseFollow,
  initTiltEffect,
  initMagneticButtons,
  initScrollProgress,
  initLazyLoad,
  animateCounter
};
