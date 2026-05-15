const page = document.body.dataset.page;
const navLinks = document.querySelectorAll(".nav-link");
const mobileToggle = document.querySelector(".mobile-nav-toggle");
const sidebar = document.querySelector(".sidebar");

navLinks.forEach((link) => {
  if (link.dataset.page === page) {
    link.classList.add("is-active");
  }
});

if (mobileToggle && sidebar) {
  mobileToggle.addEventListener("click", () => {
    sidebar.classList.toggle("is-open");
  });
}

const contactForm = document.querySelector("[data-contact-form]");
const contactSuccess = document.querySelector("[data-contact-success]");

if (contactForm && contactSuccess) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    contactSuccess.hidden = false;
    contactForm.reset();
    contactSuccess.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

const appTabs = document.querySelectorAll("[data-target-screen]");
const appScreens = document.querySelectorAll("[data-app-screen]");

if (appTabs.length && appScreens.length) {
  appTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.targetScreen;

      appTabs.forEach((item) => item.classList.remove("is-active"));
      appScreens.forEach((screen) => {
        screen.classList.toggle("is-active", screen.dataset.appScreen === target);
      });

      tab.classList.add("is-active");
    });
  });
}
