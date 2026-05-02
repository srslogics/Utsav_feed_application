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
