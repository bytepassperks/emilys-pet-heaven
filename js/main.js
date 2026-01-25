// ===== EMILY PET'S HEAVEN - MAIN JAVASCRIPT =====

document.addEventListener('DOMContentLoaded', function() {
  // Initialize all components
  initMobileMenu();
  initSmoothScroll();
  initContactForm();
  initFAQAccordion();
  initTestimonialCarousel();
});

// ===== MOBILE MENU =====
function initMobileMenu() {
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  const navOverlay = document.querySelector('.nav-overlay');
  const body = document.body;

  if (!menuToggle || !navMenu) return;

  // Create overlay if it doesn't exist
  let overlay = navOverlay;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);
  }

  function toggleMenu() {
    menuToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
    overlay.classList.toggle('active');
    body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
  }

  function closeMenu() {
    menuToggle.classList.remove('active');
    navMenu.classList.remove('active');
    overlay.classList.remove('active');
    body.style.overflow = '';
  }

  menuToggle.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', closeMenu);

  // Close menu when clicking a link
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close menu on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && navMenu.classList.contains('active')) {
      closeMenu();
    }
  });

  // Close menu on window resize (if switching to desktop)
  window.addEventListener('resize', function() {
    if (window.innerWidth > 991 && navMenu.classList.contains('active')) {
      closeMenu();
    }
  });
}

// ===== SMOOTH SCROLL =====
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ===== CONTACT FORM - WHATSAPP SUBMISSION =====
function initContactForm() {
  // WhatsApp number (Emily's Pet Heaven)
  const whatsappNumber = '919830802898';

  // Handle all booking/contact forms
  const forms = document.querySelectorAll('#contact-form, #contactForm, #appointmentForm');
  
  forms.forEach(form => {
    if (!form) return;

    // Form submission - Send to WhatsApp
    form.addEventListener('submit', function(e) {
      e.preventDefault();

      // Get form values
      const name = form.querySelector('[name="name"]')?.value || '';
      const phone = form.querySelector('[name="phone"]')?.value || '';
      const email = form.querySelector('[name="email"]')?.value || '';
      const service = form.querySelector('[name="service"]')?.value || '';
      const petType = form.querySelector('[name="pet-type"]')?.value || '';
      const petName = form.querySelector('[name="pet-name"]')?.value || '';
      const date = form.querySelector('[name="date"]')?.value || '';
      const message = form.querySelector('[name="message"]')?.value || '';

      // Validate required fields
      if (!name.trim() || !phone.trim()) {
        alert('Please fill in your name and phone number.');
        return;
      }

      // Build WhatsApp message
      let whatsappMessage = `*New Booking Request from Emily's Pet Heaven Website*\n\n`;
      whatsappMessage += `*Name:* ${name}\n`;
      whatsappMessage += `*Phone:* ${phone}\n`;
      if (email) whatsappMessage += `*Email:* ${email}\n`;
      if (service) whatsappMessage += `*Service:* ${service}\n`;
      if (petType) whatsappMessage += `*Pet Type:* ${petType}\n`;
      if (petName) whatsappMessage += `*Pet Name:* ${petName}\n`;
      if (date) whatsappMessage += `*Preferred Date:* ${date}\n`;
      if (message) whatsappMessage += `*Message:* ${message}\n`;

      // Create WhatsApp URL
      const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

      // Show confirmation
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="loading"></span> Redirecting to WhatsApp...';
      submitBtn.disabled = true;

      // Redirect to WhatsApp after brief delay
      setTimeout(() => {
        window.open(whatsappURL, '_blank');
        
        // Reset button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        // Show success alert
        alert('Your booking request has been sent to WhatsApp! We will respond within 24 hours.');
        
        // Reset form
        form.reset();
      }, 500);
    });
  });
}

// ===== FAQ ACCORDION =====
function initFAQAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    if (!question || !answer) return;

    question.addEventListener('click', function() {
      const isActive = item.classList.contains('active');

      // Close all other items (optional - remove for multi-open)
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
        }
      });

      // Toggle current item
      item.classList.toggle('active');

      // Update ARIA attributes
      question.setAttribute('aria-expanded', !isActive);
    });

    // Keyboard accessibility
    question.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        question.click();
      }
    });
  });
}

// ===== TESTIMONIAL CAROUSEL =====
function initTestimonialCarousel() {
  const carousel = document.querySelector('.testimonial-carousel');
  if (!carousel) return;

  const slidesContainer = carousel.querySelector('.testimonial-slides');
  const slides = carousel.querySelectorAll('.testimonial-slide');
  const prevBtn = carousel.querySelector('.testimonial-prev');
  const nextBtn = carousel.querySelector('.testimonial-next');
  const dotsContainer = carousel.querySelector('.testimonial-dots');

  if (!slidesContainer || slides.length === 0) return;

  let currentIndex = 0;
  let autoplayInterval;
  const autoplayDelay = 5000; // 5 seconds

  // Create dots
  if (dotsContainer) {
    slides.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'testimonial-dot' + (index === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Go to testimonial ${index + 1}`);
      dot.addEventListener('click', () => goToSlide(index));
      dotsContainer.appendChild(dot);
    });
  }

  const dots = dotsContainer?.querySelectorAll('.testimonial-dot');

  function updateSlides() {
    // Update slide positions
    slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;

    // Update active states
    slides.forEach((slide, index) => {
      slide.classList.toggle('active', index === currentIndex);
    });

    // Update dots
    dots?.forEach((dot, index) => {
      dot.classList.toggle('active', index === currentIndex);
    });
  }

  function goToSlide(index) {
    currentIndex = index;
    if (currentIndex >= slides.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = slides.length - 1;
    updateSlides();
    resetAutoplay();
  }

  function nextSlide() {
    goToSlide(currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(currentIndex - 1);
  }

  function startAutoplay() {
    autoplayInterval = setInterval(nextSlide, autoplayDelay);
  }

  function stopAutoplay() {
    clearInterval(autoplayInterval);
  }

  function resetAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  // Event listeners
  if (prevBtn) prevBtn.addEventListener('click', prevSlide);
  if (nextBtn) nextBtn.addEventListener('click', nextSlide);

  // Pause on hover
  carousel.addEventListener('mouseenter', stopAutoplay);
  carousel.addEventListener('mouseleave', startAutoplay);

  // Touch/swipe support
  let touchStartX = 0;
  let touchEndX = 0;

  carousel.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
  }

  // Keyboard navigation
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prevSlide();
    if (e.key === 'ArrowRight') nextSlide();
  });

  // Initialize
  updateSlides();
  startAutoplay();
}

// ===== UTILITY FUNCTIONS =====

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Check if element is in viewport
function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Format phone number
function formatPhoneNumber(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  return phone;
}

// WhatsApp link generator
function generateWhatsAppLink(phone, message = '') {
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}${message ? '?text=' + encodedMessage : ''}`;
}

// ===== HEADER SCROLL EFFECT =====
(function() {
  const header = document.querySelector('.header');
  if (!header) return;

  let lastScroll = 0;

  window.addEventListener('scroll', throttle(function() {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
  }, 100));
})();

// ===== ACTIVE NAV LINK =====
(function() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-menu a');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();
