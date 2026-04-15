(function () {
  "use strict";

  /**
   * Полная перезагрузка (F5 / Ctrl+R): сбрасываем якорь в адресе и скролл в начало.
   * Иначе после клика по доку (например «Контакты») остаётся ...#contacts — обновление снова
   * открывает этот блок, хотя ожидается старт с верха лендинга.
   */
  function resetScrollAfterReload() {
    var isReload = false;
    try {
      var entries = performance.getEntriesByType("navigation");
      if (entries && entries.length && entries[0].type === "reload") isReload = true;
    } catch (e) {}
    if (!isReload && typeof performance !== "undefined" && performance.navigation) {
      try {
        if (performance.navigation.type === 1) isReload = true;
      } catch (e2) {}
    }
    if (!isReload) return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e3) {}
    window.scrollTo(0, 0);
  }

  /**
   * Без якоря в URL: стартуем с верха страницы.
   * Иначе браузер часто восстанавливает прежний скролл (кажется «перебросом» на Услуги и т.д.),
   * а при #fragment перезагрузка по закону остаётся на том же якоре.
   */
  function scrollToTopIfNoHash() {
    var h = window.location.hash;
    if (h && h !== "#") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }

  resetScrollAfterReload();
  scrollToTopIfNoHash();
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) return;
    resetScrollAfterReload();
  });
  window.addEventListener(
    "load",
    function () {
      resetScrollAfterReload();
      scrollToTopIfNoHash();
    },
    { once: true }
  );

  var yearEl = document.getElementById("year");
  var calcForm = document.getElementById("calc-form");
  var calcResult = document.getElementById("calc-result");
  var calcSum = document.getElementById("calc-sum");
  var calcResultIdle = document.getElementById("calc-result-idle");
  var toast = document.getElementById("toast");
  /** Вызывается после смены высоты страницы (калькулятор и т.п.) — пересчёт якорей дока */
  var onDocLayoutChange = null;

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var dock = document.getElementById("site-dock");
  if (dock) {
    var dockLinks = dock.querySelectorAll('a[href^="#"]');
    var mainSections = document.querySelectorAll("main section[id]");
    /** Верх секции в координатах документа — пересчитываем без скролла, без layout в каждом кадре */
    var sectionTops = [];

    function idFromHref(href) {
      if (!href || href.charAt(0) !== "#") return "";
      return href.slice(1);
    }

    function measureSections() {
      sectionTops.length = 0;
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      for (var i = 0; i < mainSections.length; i++) {
        var el = mainSections[i];
        var r = el.getBoundingClientRect();
        sectionTops.push({ id: el.id, top: r.top + scrollY });
      }
    }

    function updateDockActive() {
      if (!sectionTops.length) measureSections();
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      var probe = scrollY + Math.min(window.innerHeight * 0.22, 140);
      var current = "hero";
      for (var i = 0; i < sectionTops.length; i++) {
        if (sectionTops[i].top <= probe + 1) current = sectionTops[i].id;
      }
      dockLinks.forEach(function (a) {
        var on = idFromHref(a.getAttribute("href")) === current;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }

    var scrollRafPending = false;
    window.addEventListener(
      "scroll",
      function () {
        if (!scrollRafPending) {
          scrollRafPending = true;
          window.requestAnimationFrame(function () {
            scrollRafPending = false;
            updateDockActive();
          });
        }
      },
      { passive: true }
    );

    var resizeTimer;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        measureSections();
        updateDockActive();
      }, 120);
    });

    window.addEventListener("load", function () {
      measureSections();
      updateDockActive();
    });
    measureSections();
    updateDockActive();

    onDocLayoutChange = function () {
      measureSections();
      updateDockActive();
    };

    dockLinks.forEach(function (a) {
      a.addEventListener("click", function () {
        window.requestAnimationFrame(function () {
          try {
            a.scrollIntoView({
              inline: "center",
              block: "nearest",
              behavior: "smooth",
            });
          } catch (e) {
            a.scrollIntoView(false);
          }
        });
      });
    });
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        toast.hidden = true;
      }, 400);
    }, 4200);
  }

  function formatByn(amount) {
    var n = Math.round(amount);
    try {
      return new Intl.NumberFormat("ru-BY", {
        style: "currency",
        currency: "BYN",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(n);
    } catch (err) {
      return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " BYN";
    }
  }

  if (calcForm && calcResult && calcSum) {
    var FINISH_RATES = {
      pavers: { tilePerM2: 120, borderPerM: 35 },
      ceragranite: { tilePerM2: 225, borderPerM: 105 },
      granite: { tilePerM2: null, borderPerM: null },
    };
    var TARIFF_TO_FINISH = {
      econom: "pavers",
      standard: "ceragranite",
      premium: "granite",
    };

    var tariffValueInput = document.getElementById("calc-tariff-value");
    var tariffChoiceBtns = calcForm.querySelectorAll("[data-calc-tariff]");

    function setCalcTariffUi(value) {
      if (tariffValueInput) tariffValueInput.value = value;
      for (var ti = 0; ti < tariffChoiceBtns.length; ti++) {
        var b = tariffChoiceBtns[ti];
        var on = b.getAttribute("data-calc-tariff") === value;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      }
    }

    for (var tb = 0; tb < tariffChoiceBtns.length; tb++) {
      tariffChoiceBtns[tb].addEventListener("click", function () {
        setCalcTariffUi(this.getAttribute("data-calc-tariff"));
      });
    }
    setCalcTariffUi(tariffValueInput && tariffValueInput.value ? tariffValueInput.value : "standard");

    calcForm.addEventListener("reset", function () {
      window.requestAnimationFrame(function () {
        setCalcTariffUi(tariffValueInput && tariffValueInput.value ? tariffValueInput.value : "standard");
        if (calcResultIdle) calcResultIdle.hidden = false;
        if (calcResult) calcResult.hidden = true;
      });
    });

    function showCalcResultBlock() {
      if (calcResultIdle) calcResultIdle.hidden = true;
      if (calcResult) calcResult.hidden = false;
    }

    /** «от» — обычный вес, сумма — жирная (без innerHTML) */
    function setCalcSumWithAmount(amountText) {
      calcSum.textContent = "";
      var prefix = document.createElement("span");
      prefix.className = "calc-result-sum__prefix";
      prefix.textContent = "от ";
      var amount = document.createElement("strong");
      amount.className = "calc-result-sum__amount";
      amount.textContent = amountText;
      calcSum.appendChild(prefix);
      calcSum.appendChild(amount);
    }

    function setCalcSumGraniteCopy() {
      calcSum.textContent = "По согласованию";
    }

    function parseDecimal(raw) {
      var t = String(raw != null ? raw : "").trim().replace(",", ".");
      if (t === "") return NaN;
      return parseFloat(t, 10);
    }

    calcForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(calcForm);
      var L = parseDecimal(fd.get("burial_length"));
      var W = parseDecimal(fd.get("burial_width"));
      var tierKey = String(fd.get("tariff") || "standard");
      var finish = TARIFF_TO_FINISH[tierKey];
      if (!finish) finish = "ceragranite";

      if (!L || !W || L <= 0 || W <= 0 || Number.isNaN(L) || Number.isNaN(W)) {
        showToast("Укажите длину и ширину захоронения положительными числами.");
        return;
      }

      var areaM2 = L * W;
      /* Бордюр по стандарту — периметр прямоугольника по длине и ширине */
      var borderLm = 2 * (L + W);

      var rates = FINISH_RATES[finish] || FINISH_RATES.pavers;

      if (finish === "granite") {
        setCalcSumGraniteCopy();
        showCalcResultBlock();
        if (onDocLayoutChange) window.requestAnimationFrame(onDocLayoutChange);
        return;
      }

      var partTile = areaM2 * rates.tilePerM2;
      var partBorder = borderLm * rates.borderPerM;
      var total = Math.round(partTile + partBorder);

      setCalcSumWithAmount(formatByn(total));
      showCalcResultBlock();
      if (onDocLayoutChange) {
        window.requestAnimationFrame(onDocLayoutChange);
      }
    });
  }

  /* Кнопки «Заказать»: каждая — только когда её карточка реально в зоне видимости (без показа при F5) */
  var servicesSection = document.getElementById("services");
  if (servicesSection) {
    var serviceCards = servicesSection.querySelectorAll(".cards > article.card");
    var serviceOrderBtns = servicesSection.querySelectorAll(".card-order-btn");

    for (var b = 0; b < serviceOrderBtns.length; b++) {
      serviceOrderBtns[b].setAttribute("tabindex", "-1");
    }

    var orderBtnRevealLagMs = 300;

    function revealCardOrderBtn(card) {
      if (card.classList.contains("is-order-revealed")) return;
      var btn = card.querySelector(".card-order-btn");
      window.setTimeout(function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            card.classList.add("is-order-revealed");
            if (btn) btn.removeAttribute("tabindex");
          });
        });
      }, orderBtnRevealLagMs);
    }

    if ("IntersectionObserver" in window) {
      var cardIo = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry.isIntersecting) continue;
            var t = entry.target;
            revealCardOrderBtn(t);
            try {
              cardIo.unobserve(t);
            } catch (e) {
              /* ignore */
            }
          }
        },
        {
          root: null,
          /* Чуть шире зона снизу — «Заказать» появляется раньше при скролле */
          rootMargin: "0px 0px -10% 0px",
          threshold: 0.38,
        }
      );
      for (var c = 0; c < serviceCards.length; c++) {
        cardIo.observe(serviceCards[c]);
      }
    } else {
      for (var c2 = 0; c2 < serviceCards.length; c2++) {
        revealCardOrderBtn(serviceCards[c2]);
      }
    }
  }

  /* Галерея: «до / после» — клавиатура с range; мышь/тач — перетаскивание по кадру (Pointer Events) */
  var compareBlocks = document.querySelectorAll(".compare__view");
  for (var ci = 0; ci < compareBlocks.length; ci++) {
    (function (view) {
      var range = view.querySelector(".compare__range");
      if (!range) return;

      function applyPct(pct) {
        if (Number.isNaN(pct)) pct = 50;
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        view.style.setProperty("--compare-pct", pct + "%");
        range.value = String(Math.round(pct));
      }

      function pctFromClientX(clientX) {
        var r = view.getBoundingClientRect();
        if (r.width <= 0) return 50;
        return ((clientX - r.left) / r.width) * 100;
      }

      function syncFromRange() {
        applyPct(Number(range.value));
      }

      range.addEventListener("input", syncFromRange);
      range.addEventListener("change", syncFromRange);

      var dragPointerId = null;

      function onPointerDown(e) {
        if (typeof e.button === "number" && e.button > 0) return;
        dragPointerId = e.pointerId;
        try {
          view.setPointerCapture(e.pointerId);
        } catch (errCap) {
          /* ignore */
        }
        applyPct(pctFromClientX(e.clientX));
      }

      function onPointerMove(e) {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        if (e.pointerType === "touch") {
          try {
            e.preventDefault();
          } catch (pe) {
            /* passive listener elsewhere — touch-action:none на view обычно достаточно */
          }
        }
        applyPct(pctFromClientX(e.clientX));
      }

      function onPointerUp(e) {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        dragPointerId = null;
        try {
          view.releasePointerCapture(e.pointerId);
        } catch (errRel) {
          /* ignore */
        }
      }

      function onLostPointerCapture(e) {
        if (e.pointerId === dragPointerId) dragPointerId = null;
      }

      view.addEventListener("pointerdown", onPointerDown, true);
      view.addEventListener("pointermove", onPointerMove, { passive: false });
      view.addEventListener("pointerup", onPointerUp);
      view.addEventListener("pointercancel", onPointerUp);
      view.addEventListener("lostpointercapture", onLostPointerCapture);

      syncFromRange();
    })(compareBlocks[ci]);
  }

  /* Галерея фото: миниатюры, стрелки, клавиши ← →; лайтбокс по клику на кадр */
  var photoGallery = document.getElementById("work-photo-gallery");
  if (photoGallery) {
    var mainImg = document.getElementById("ig-gallery-main");
    var counterEl = photoGallery.querySelector(".ig-gallery__counter");
    var btnPrev = photoGallery.querySelector(".ig-gallery__nav--prev");
    var btnNext = photoGallery.querySelector(".ig-gallery__nav--next");
    var thumbNodes = photoGallery.querySelectorAll(".ig-gallery__thumb");
    var zoomHit = photoGallery.querySelector(".ig-gallery__zoom-hit");
    var lightbox = document.getElementById("ig-lightbox");
    var lightboxImg = document.getElementById("ig-lightbox-img");
    var lbBackdrop = lightbox ? lightbox.querySelector(".ig-lightbox__backdrop") : null;
    var lbClose = lightbox ? lightbox.querySelector(".ig-lightbox__close") : null;
    var lbPrev = lightbox ? lightbox.querySelector(".ig-lightbox__nav--prev") : null;
    var lbNext = lightbox ? lightbox.querySelector(".ig-lightbox__nav--next") : null;
    var total = thumbNodes.length;
    var index = 0;
    var lightboxOpen = false;
    var lastFocusBeforeLightbox = null;

    function syncLightboxIfOpen() {
      if (!lightboxOpen || !lightboxImg || !mainImg) return;
      var s = mainImg.getAttribute("src");
      var a = mainImg.getAttribute("alt") || "";
      if (s) lightboxImg.setAttribute("src", s);
      lightboxImg.setAttribute("alt", a);
    }

    function setIndex(nextIdx) {
      if (!total || !mainImg) return;
      if (nextIdx < 0) nextIdx = total - 1;
      if (nextIdx >= total) nextIdx = 0;
      index = nextIdx;
      var btn = thumbNodes[index];
      if (!btn) return;
      var src = btn.getAttribute("data-ig-src");
      var alt = btn.getAttribute("data-ig-alt") || "";
      if (src) mainImg.setAttribute("src", src);
      mainImg.setAttribute("alt", alt);
      if (counterEl) counterEl.textContent = index + 1 + " / " + total;
      for (var ti = 0; ti < thumbNodes.length; ti++) {
        var t = thumbNodes[ti];
        var on = ti === index;
        t.classList.toggle("is-selected", on);
        if (on) t.setAttribute("aria-current", "true");
        else t.removeAttribute("aria-current");
      }
      syncLightboxIfOpen();
    }

    function openLightbox() {
      if (!lightbox || !lightboxImg || !mainImg) return;
      lastFocusBeforeLightbox = document.activeElement;
      lightboxOpen = true;
      syncLightboxIfOpen();
      lightbox.hidden = false;
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      try {
        lightbox.focus();
      } catch (errLb) {
        /* ignore */
      }
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightboxOpen = false;
      lightbox.hidden = true;
      lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastFocusBeforeLightbox && typeof lastFocusBeforeLightbox.focus === "function") {
        try {
          lastFocusBeforeLightbox.focus();
        } catch (errF) {
          /* ignore */
        }
      }
      lastFocusBeforeLightbox = null;
    }

    function onThumbClick(e) {
      var t = e.currentTarget;
      for (var i = 0; i < thumbNodes.length; i++) {
        if (thumbNodes[i] === t) {
          setIndex(i);
          return;
        }
      }
    }

    for (var th = 0; th < thumbNodes.length; th++) {
      thumbNodes[th].addEventListener("click", onThumbClick);
    }
    if (btnPrev) btnPrev.addEventListener("click", function () { setIndex(index - 1); });
    if (btnNext) btnNext.addEventListener("click", function () { setIndex(index + 1); });

    var SWIPE_PX = 48;
    var swipeGalPid = null;
    var swipeGalX0 = 0;
    var swipeGalSuppressClick = false;

    if (zoomHit) {
      zoomHit.addEventListener("pointerdown", function (e) {
        if (typeof e.button === "number" && e.button > 0) return;
        swipeGalPid = e.pointerId;
        swipeGalX0 = e.clientX;
        swipeGalSuppressClick = false;
        try {
          zoomHit.setPointerCapture(e.pointerId);
        } catch (g1) {
          /* ignore */
        }
      });
      zoomHit.addEventListener("pointerup", function (e) {
        if (swipeGalPid === null || e.pointerId !== swipeGalPid) return;
        var dx = e.clientX - swipeGalX0;
        swipeGalPid = null;
        try {
          zoomHit.releasePointerCapture(e.pointerId);
        } catch (g2) {
          /* ignore */
        }
        if (dx <= -SWIPE_PX) {
          setIndex(index + 1);
          swipeGalSuppressClick = true;
        } else if (dx >= SWIPE_PX) {
          setIndex(index - 1);
          swipeGalSuppressClick = true;
        }
      });
      zoomHit.addEventListener("pointercancel", function (e) {
        if (swipeGalPid !== null && e.pointerId === swipeGalPid) swipeGalPid = null;
      });
      zoomHit.addEventListener("click", function (e) {
        if (swipeGalSuppressClick) {
          e.preventDefault();
          e.stopPropagation();
          swipeGalSuppressClick = false;
          return;
        }
        openLightbox();
      });
    }

    var swipeLbPid = null;
    var swipeLbX0 = 0;
    if (lightboxImg) {
      lightboxImg.addEventListener("pointerdown", function (e) {
        if (!lightboxOpen) return;
        if (typeof e.button === "number" && e.button > 0) return;
        swipeLbPid = e.pointerId;
        swipeLbX0 = e.clientX;
        try {
          lightboxImg.setPointerCapture(e.pointerId);
        } catch (lb1) {
          /* ignore */
        }
      });
      lightboxImg.addEventListener(
        "pointermove",
        function (e) {
          if (!lightboxOpen || swipeLbPid !== e.pointerId) return;
          if (e.pointerType === "touch") {
            try {
              e.preventDefault();
            } catch (pe) {
              /* passive */
            }
          }
        },
        { passive: false }
      );
      lightboxImg.addEventListener("pointerup", function (e) {
        if (swipeLbPid === null || e.pointerId !== swipeLbPid) return;
        var dx = e.clientX - swipeLbX0;
        swipeLbPid = null;
        try {
          lightboxImg.releasePointerCapture(e.pointerId);
        } catch (lb2) {
          /* ignore */
        }
        if (dx <= -SWIPE_PX) setIndex(index + 1);
        else if (dx >= SWIPE_PX) setIndex(index - 1);
      });
      lightboxImg.addEventListener("pointercancel", function (e) {
        if (swipeLbPid !== null && e.pointerId === swipeLbPid) swipeLbPid = null;
      });
    }

    if (lightbox) {
      lightbox.addEventListener("keydown", function (e) {
        if (!lightboxOpen) return;
        if (e.key === "Escape") {
          e.preventDefault();
          closeLightbox();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setIndex(index - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setIndex(index + 1);
        }
      });
    }
    if (lbBackdrop) lbBackdrop.addEventListener("click", closeLightbox);
    if (lbClose) lbClose.addEventListener("click", closeLightbox);
    if (lbPrev) lbPrev.addEventListener("click", function () { setIndex(index - 1); });
    if (lbNext) lbNext.addEventListener("click", function () { setIndex(index + 1); });

    photoGallery.addEventListener("keydown", function (e) {
      if (lightboxOpen) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex(index + 1);
      }
    });
  }

  /* Плавающая кнопка: гранит + бумажный самолётик, колонка соцсетей */
  var shareFab = document.getElementById("share-fab");
  var shareFabToggle = document.getElementById("share-fab-toggle");
  var shareFabPanel = document.getElementById("share-fab-panel");
  if (shareFab && shareFabToggle && shareFabPanel) {
    function setShareFabOpen(open) {
      shareFab.classList.toggle("is-open", open);
      shareFabToggle.setAttribute("aria-expanded", open ? "true" : "false");
      shareFabPanel.setAttribute("aria-hidden", open ? "false" : "true");
    }

    shareFabToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setShareFabOpen(!shareFab.classList.contains("is-open"));
    });

    shareFabPanel.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) {
        setShareFabOpen(false);
      }
    });

    document.addEventListener("click", function () {
      setShareFabOpen(false);
    });

    shareFab.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!shareFab.classList.contains("is-open")) return;
      e.preventDefault();
      setShareFabOpen(false);
      try {
        shareFabToggle.focus();
      } catch (errSf) {
        /* ignore */
      }
    });
  }

  /** Рамка заголовка секции: обводка «по кругу» при первом попадании в зону видимости */
  var headPlates = document.querySelectorAll(".section-head__plate");
  if (headPlates.length) {
    if ("IntersectionObserver" in window) {
      var headPlateIo = new IntersectionObserver(
        function (entries) {
          for (var hi = 0; hi < entries.length; hi++) {
            var he = entries[hi];
            if (!he.isIntersecting) continue;
            he.target.classList.add("is-drawn");
            try {
              headPlateIo.unobserve(he.target);
            } catch (err2) {
              /* ignore */
            }
          }
        },
        { root: null, rootMargin: "0px 0px -12% 0px", threshold: 0.2 }
      );
      for (var hj = 0; hj < headPlates.length; hj++) {
        headPlateIo.observe(headPlates[hj]);
      }
    } else {
      for (var hk = 0; hk < headPlates.length; hk++) {
        headPlates[hk].classList.add("is-drawn");
      }
    }
  }
})();
