import React, { useEffect, useMemo,useState } from 'react';
import { FaFlask, FaCog, FaLaptopCode, FaAtom, FaEnvelope, FaPhoneAlt } from 'react-icons/fa';
import { Heart, ArrowRight, ArrowLeft } from 'lucide-react';

import matchImg from '/match.jpg';
import searchImg from '/search.jpg';
import analyzeImg from '/analyze.jpg';
import logooImg from '/logoo.png';
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const CARD_W = 270;   // must match the card’s CSS width
const GAP_PX = 24;    // Tailwind gap-6 = 24px
const VISIBLE = 3;    // exactly two cards visible
const VIEWPORT_W = CARD_W * VISIBLE + GAP_PX * (VISIBLE - 1);

const Home = () => {
  const [scholarships, setScholarships] = useState([]);
  const [scholarshipIndex, setScholarshipIndex] = useState(0);
const [items, setItems] = useState([]);
const [err, setErr] = useState("");
const [uniitems, unisetItems] = useState([]);
useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/scholarships/near-deadline?limit=12`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setScholarships(Array.isArray(data.items) ? data.items : []);
        setScholarshipIndex(0); // reset to start when data arrives
      } catch (e) {
        console.error("Failed to load featured scholarships:", e);
        setScholarships([]); // fallback empty
      }
    };

    
    run();
  }, []);

   useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/universities/top?limit=10`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        console.error(e);
        setErr("Failed to load universities.");
      }
    };
    run();
  }, []);

useEffect(() => {
  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/universities/top-international?limit=10`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // ✅ API returns { items: [...] }
      unisetItems(Array.isArray(data.uniitems) ? data.uniitems : []);
    } catch (e) {
      console.error(e);
      setErr("Failed to load universities.");
      unisetItems([]);
    }
  })();
}, []);

  // clamp index so we never scroll past the end
  const maxIndex = useMemo(
    () => Math.max(0, (scholarships.length || 0) - VISIBLE),
    [scholarships.length]
  );

  const prevScholarship = () =>
    setScholarshipIndex((i) => Math.max(0, i - 1));

  const nextScholarship = () =>
    setScholarshipIndex((i) => Math.min(maxIndex, i + 1));

  const offset = -(CARD_W + GAP_PX) * scholarshipIndex;
  return (
    <div className="font-sans">
    

<div
  className="relative  bg-cover bg-center py-8 px-8 flex items-center"
  style={{
    backgroundImage: "url('/unistu.png')", // your image path
  }}
>
  {/* Text content */}
  <div className="max-w-xl text-[#254085] text-left bg-white/40 p-6 rounded-lg ">
    <h1 className="text-2xl font-bold mb-4">Find Scholarships</h1>
    <p className="text-md mb-2">Scholarships for every type of student</p>
    <p className="text-md mb-4">100% Free</p>
    <p className="text-lg mb-6">Vetted Scholarship Opportunities</p>
    <button className="bg-[#254085] text-white font-semibold px-6 py-3 rounded-full hover:bg-[#1e3369]">
      Find Scholarships Now
    </button>
  </div>
</div>



      {/* Four Category Icons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center p-10">
        {[{
          icon: <FaLaptopCode size={40} className="mx-auto text-[#254085]" />,
          label: 'Technology'
        }, {
          icon: <FaFlask size={40} className="mx-auto text-[#254085]" />,
          label: 'Science'
        }, {
          icon: <FaCog size={40} className="mx-auto text-[#254085]" />,
          label: 'Engineering'
        }, {
          icon: <FaAtom size={40} className="mx-auto text-[#254085]" />,
          label: 'Others'
        }].map(({ icon, label }) => (
          <div key={label} className="cursor-pointer bg-[#F2F3F7] p-4 rounded shadow-lg">
            {icon}
            <p className="mt-2 text-lg font-medium">{label}</p>
          </div>
        ))}
      </div>

     {/* Scholarship Card Slider */}
      <div className="bg-white p-3">
        <h2 className="text-xl font-bold mb-6 text-center">Featured Scholarships</h2>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={prevScholarship}
            disabled={scholarshipIndex === 0}
            className="p-2 bg-[#254085] rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <ArrowLeft />
          </button>

<div className="overflow-hidden" style={{ width: `${VIEWPORT_W}px` }}>
  {/* Track */}
  <div
    className="flex gap-6"
    style={{
      transform: `translateX(${offset}px)`,
      transition: "transform 400ms ease-in-out",
      willChange: "transform",
    }}
  >
    {scholarships.map((sch, i) => (
      <div
        key={sch.id || i}
        className="border rounded-lg p-4 shadow hover:shadow-lg bg-[#254085]"
        style={{ width: `${CARD_W}px`, minWidth: `${CARD_W}px` }}  // exact card width
      >
        <div className="flex items-center gap-3 mb-3">
          <img src='logo.png' alt="Scholarship Logo" className="w-8 h-8 rounded-full" />
          <div>
            <h3 className="font-semibold text-sm text-white">{sch.name}</h3>
            
          </div>
           
        </div>
         <p className="text-xs mb-4 text-white border-b-2 border-white gap-2 pb-2">{sch.eligibility}</p>
       <p className="text-xs mb-2 text-green-600">Deadline: {sch.deadline}</p>

        <p className="text-xs mb-2 text-white">Type: {sch.type}</p>
        <p className="text-xs mb-2 text-white">Level: {sch.level}</p>
        <div className="flex justify-between items-center mt-4">
          <a
            href={sch.link || "#"}
            target="_blank"
            rel="noreferrer"
            className="text-[#254085] bg-white px-4 py-2 rounded text-sm"
          >
            Apply Now
          </a>
        </div>
      </div>
    ))}
  </div>
</div>

          <button
            onClick={nextScholarship}
            disabled={scholarshipIndex === maxIndex}
            className="p-2 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <ArrowRight />
          </button>
        </div>
      </div>
<div className="bg-white py-8 px-4">
      <h2 className="text-2xl font-bold text-center text-black mb-6">
        Top Universities
      </h2>

      {err && <div className="text-center text-red-600 mb-4">{err}</div>}

      {/* Swipeable track */}
      <div
        className="
          overflow-x-auto
          [-webkit-overflow-scrolling:touch]
          snap-x snap-mandatory
          scrollbar-none
        "
      >
        <div className="flex gap-4 pr-4">
          {items.map((u, i) => (
            <div
              key={i}
              className="
                snap-start
                bg-[#254085] rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition
                w-70
                shrink-0
              "
            >
              <img
                src={u.image || "/placeholder.jpg"}
                alt={u.name || "University"}
                className="w-full h-36 object-contain bg-white"
              />
              <div className="p-3 flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-white">
                   {u.name}
                </h3>
                <p className="text-sm text-white/90">
                  Students: {u.students?.toLocaleString?.() ?? u.students ?? "-"}
                </p>
                <p className="text-sm text-white/90">Country: {u.country || "-"}</p>
                <p className="text-sm text-white/90">Rank: {u.rank ?? "-"}</p>

                <a
                  href={u.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 w-full bg-white text-[#254085]  text-sm font-medium py-2 rounded-md hover:bg-[#254085] hover:text-white hover:border border-white transition text-center"
                >
                  View Detail
                </a>
              </div>
            </div>
          ))}

          {/* (Optional) skeletons if list is empty while loading */}
          {items.length === 0 && !err && (
            <>
              {[...Array(4)].map((_, i) => (
                <div
                  key={`s${i}`}
                  className="
                    snap-start bg-[#254085]/70 rounded-xl overflow-hidden
                    min-w-[180px] sm:min-w-[200px] lg:min-w-[230px] h-[260px]
                    animate-pulse shrink-0
                  "
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
<div className="bg-white py-10 px-6">
  <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
    Top International Students Universities
  </h2>

  {err && <div className="text-center text-red-600 mb-6">{err}</div>}

  {/* Swipeable track (like Top Universities) */}
  <div
    className="
      overflow-x-auto
      [-webkit-overflow-scrolling:touch]
      snap-x snap-mandatory
      scrollbar-none
      touch-pan-x
    "
  >
    <div className="flex gap-4 pr-4">
      {uniitems.map((u) => (
        <div
          key={u.id}
          className="
            snap-start
            bg-white rounded-lg shadow-lg overflow-hidden text-center
            w-[260px] min-w-[260px] shrink-0
          "
        >
         <div className="flex items-center justify-center w-full h-40 bg-white">
  <img
    src={u.image || "/placeholder.jpg"}
    alt={u.name || "University"}
    className="max-h-full max-w-full object-contain"
  />
</div>

          <div className="bg-[#254085] text-white p-4 h-full">
            <h3 className="text-lg font-semibold">
              {u.name || 'University name'}
            </h3>
            <p className="text-sm opacity-80">
              Acceptance rate: {u.international || '-'}
            </p>
          </div>
        </div>
      ))}

      {/* Simple skeletons if empty and no error */}
      {uniitems.length === 0 && !err && (
        <>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="
                snap-start bg-[#254085]/10 rounded-lg overflow-hidden
                w-[260px] min-w-[260px] h-[320px] animate-pulse shrink-0
              "
            />
          ))}
        </>
      )}
    </div>
  </div>
</div>


      {/* Three Image Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-10 ">
        {[{ img: matchImg, text: 'Go to Matching Page' },
          { img: searchImg, text: 'Go to Searching Page' },
          { img: analyzeImg, text: 'Go to Analysis Page' }].map(({ img, text }) => (
          <div key={text} className="cursor-pointer rounded shadow-md overflow-hidden hover:shadow-lg">
            <img src={img} alt={text} className="w-full h-40 lg:h-64 xl:h-72 object-cover" />
            <div className="p-4 font-medium text-center bg-white">{text}</div>
          </div>
        ))}
      </div>

      {/* FAQ Section */}
      <section className="py-12 ">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {["How do I apply for scholarships?", "Is it really free?", "Can international students apply?"]
              .map((question, index) => (
                <details key={index} className="bg-white p-4 rounded-lg shadow">
                  <summary className="cursor-pointer font-semibold text-[#254085] flex items-center justify-between">
                    {question}
                    <span className="text-lg">▼</span>
                  </summary>
                  <p className="mt-2 text-sm text-gray-700">
                    This is the answer to: {question}
                  </p>
                </details>
              ))}
          </div>
        </div>
      </section>

      {/* Footer */}
     <footer className="bg-[#254085] text-white text-sm p-6 text-center space-y-2">
      {/* Contact Row */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <FaEnvelope className="text-white" />
          <a
            href="mailto:info@scholarships.com"
            className="hover:underline"
          >
            info@scholarships.com
          </a>
        </div>
        <div className="flex items-center gap-2">
          <FaPhoneAlt className="text-white" />
          <a
            href="tel:+1234567890"
            className="hover:underline"
          >
            +1 (234) 567-890
          </a>
        </div>
      </div>

      {/* Copyright & Other Info */}
      <p>Copyright © 1998 - 2025 Scholarships.com, LLC. All rights reserved.</p>
      <p>Scholarships.com Publisher</p>
      <p>Scholarships.com is a registered trademark of Scholarships.com, LLC. All rights reserved.</p>
      <p>Do Not Sell My Personal Information</p>
    </footer>
    </div>
  );
};

export default Home;
