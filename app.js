const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const selectedView = item.dataset.view;

    navItems.forEach((navItem) => navItem.classList.remove("is-active"));
    item.classList.add("is-active");

    views.forEach((view) => {
      view.classList.toggle("is-visible", view.dataset.panel === selectedView);
    });
  });
});
