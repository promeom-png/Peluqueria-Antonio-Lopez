import { useState, useEffect, useMemo } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Sparkles, 
  Send, 
  Loader2, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  Scissors,
  Plus,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/src/lib/utils";

const getAi = () => {
  try {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "AI_KEY_NOT_SET" });
  } catch (e) {
    console.error("AI Init Error:", e);
    return null;
  }
};

const ai = getAi();

interface Barber {
  id: number;
  name: string;
  role: string;
}

const BARBERS: Barber[] = [
  { id: 1, name: "Angel", role: "Peluquero" },
  { id: 2, name: "Jose Luis", role: "Peluquero" },
  { id: 3, name: "Sonia", role: "Peluquera" },
];

interface Service {
  name: string;
  price: number;
  category: "CABALLERO" | "SEÑORA";
  duration: number; // in minutes
}

const SERVICES: Service[] = [
  { name: "AFEITADO", price: 16, category: "CABALLERO", duration: 30 },
  { name: "CORTE + LAVADO", price: 17, category: "CABALLERO", duration: 30 },
  { name: "CORTE + TINTE", price: 33, category: "CABALLERO", duration: 60 },
  { name: "CORTE ADULTO", price: 16, category: "CABALLERO", duration: 30 },
  { name: "CORTAR + MARCAR", price: 30, category: "SEÑORA", duration: 60 },
  { name: "CORTE", price: 17, category: "SEÑORA", duration: 30 },
  { name: "MARCAR", price: 16, category: "SEÑORA", duration: 30 },
];

const HOURS = [
  "09:00", "10:00", "11:00", "12:00", "13:00",
  "16:00", "17:00", "18:00", "19:00", "20:00"
];

export default function BookingEngine() {
  console.log("BookingEngine rendering");
  const [step, setStep] = useState(1); // 1: Date/Time/Barber, 2: Service, 3: Info, 4: AI Suggestion
  const [weekOffset, setWeekOffset] = useState(0);
  
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [additionalServices, setAdditionalServices] = useState<Service[]>([]);
  
  const [customerInfo, setCustomerInfo] = useState({ name: "", surname: "", email: "", phone: "" });
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [existingBookings, setExistingBookings] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/bookings")
      .then(res => res.json())
      .then(data => setExistingBookings(data));
  }, []);

  const isSlotOccupied = (date: string, time: string, barberId: number) => {
    return existingBookings.some(b => b.booking_date === date && b.booking_time === time && b.barber_id === barberId);
  };

  const handleFinalBooking = async () => {
    setBookingLoading(true);
    try {
      const allServices = [selectedService!, ...additionalServices];
      
      // For simplicity in this demo, we book the main service. 
      // In a real app, we might create multiple bookings or a booking with multiple services.
      // The user said "bloqueará esa franja horaria", so we just need to save the main one or a combined one.
      
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerInfo.name,
          customer_surname: customerInfo.surname,
          customer_email: customerInfo.email,
          customer_phone: customerInfo.phone,
          service: allServices.map(s => s.name).join(", "),
          barber_id: selectedBarber?.id,
          booking_date: selectedDate,
          booking_time: selectedTime,
        }),
      });
      if (response.ok) setSuccess(true);
    } catch (error) {
      console.error("Booking Error:", error);
    } finally {
      setBookingLoading(false);
    }
  };

  const getAiSuggestion = async () => {
    setAiLoading(true);
    try {
      // Fetch previous services for this user
      const prevRes = await fetch(`/api/previous-services?email=${customerInfo.email}&phone=${customerInfo.phone}`);
      const previousServices = await prevRes.json();

      const availableServices = SERVICES.filter(s => s.name !== selectedService?.name && !additionalServices.some(as => as.name === s.name));
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `El cliente ${customerInfo.name} ha reservado ${selectedService?.name}. 
        Servicios anteriores del cliente: ${previousServices.join(", ") || "Ninguno"}.
        Servicios disponibles para sugerir: ${availableServices.map(s => s.name).join(", ")}.
        Eres un peluquero experto de "Peluquería Antonio López e Hijo". 
        Sugiere de forma muy breve y persuasiva OTRO servicio que complemente lo que ha elegido o que sea diferente a lo que suele hacerse.
        Responde en español.
        Al final incluye: "SUGERENCIA: [Nombre exacto del servicio]"`,
      });

      const text = response.text;
      setAiSuggestion(text);
    } catch (error) {
      console.error("AI Error:", error);
      setAiSuggestion("¿Te gustaría añadir algún otro servicio a tu cita?");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddSuggestedService = () => {
    const match = aiSuggestion?.match(/SUGERENCIA:\s*(.*)/);
    if (match && match[1]) {
      const suggestedName = match[1].trim();
      const service = SERVICES.find(s => s.name === suggestedName);
      if (service) {
        setAdditionalServices([...additionalServices, service]);
        setAiSuggestion(null);
        setStep(5); // Go to final summary or stay to add more? User said "mensaje emergente ¿otro servicio?"
      }
    }
  };

  const nextStep = () => {
    if (step === 3) {
      getAiSuggestion();
      setStep(4);
    } else {
      setStep(s => s + 1);
    }
  };
  const prevStep = () => setStep(s => s - 1);

  if (success) {
    return (
      <div 
        className="max-w-xl mx-auto bg-white rounded-[2.5rem] p-12 text-center shadow-2xl border border-neutral-100"
      >
        <div className="w-24 h-24 bg-olive/10 rounded-full flex items-center justify-center mx-auto mb-8">
          <CheckCircle2 className="w-12 h-12 text-olive" />
        </div>
        <h2 className="text-4xl font-serif font-medium mb-4 text-neutral-900">Cita Confirmada</h2>
        <p className="text-neutral-500 mb-10 text-lg">
          Gracias, {customerInfo.name}. Tu cita en <span className="font-medium text-neutral-900">Peluquería Antonio López e Hijo</span> ha sido registrada para el {selectedDate} a las {selectedTime}.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-medium hover:bg-neutral-800 transition-all"
        >
          Finalizar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-serif font-medium text-neutral-900 mb-2">Peluquería Antonio López e Hijo</h1>
        <p className="text-olive font-medium tracking-[0.2em] uppercase text-sm">peluqueros desde 1942</p>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-neutral-200/50 border border-neutral-100 overflow-hidden">
        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-neutral-50 flex">
          {[1, 2, 3, 4, 5].map((i) => (
            <div 
              key={i} 
              className={cn(
                "h-full transition-all duration-700 ease-in-out",
                step >= i ? "bg-olive" : "bg-transparent"
              )}
              style={{ width: '20%' }}
            />
          ))}
        </div>

        <div className="p-6 md:p-10">
          {step === 1 && (
            <div
              className="space-y-8"
            >
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="text-left">
                    <h2 className="text-3xl font-serif">Elige Día y Hora</h2>
                    {weekOffset > 0 && (
                      <p className="text-xs text-olive font-bold uppercase tracking-widest mt-1">
                        {new Date(new Date().setDate(new Date().getDate() + (weekOffset * 7))).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setWeekOffset(prev => Math.max(0, prev - 1))}
                      disabled={weekOffset === 0}
                      className="p-2 rounded-xl border border-neutral-100 bg-white hover:bg-neutral-50 disabled:opacity-20 transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex gap-2">
                      {[...Array(7)].map((_, i) => {
                        const date = new Date();
                        date.setDate(date.getDate() + (weekOffset * 7) + i);
                        const dateStr = date.toISOString().split('T')[0];
                        return (
                          <button
                            key={dateStr}
                            onClick={() => setSelectedDate(dateStr)}
                            className={cn(
                              "px-4 py-2 rounded-xl border text-sm transition-all min-w-[50px]",
                              selectedDate === dateStr ? "bg-olive text-white border-olive shadow-lg shadow-olive/20" : "bg-neutral-50 border-neutral-100 hover:border-olive/30"
                            )}
                          >
                            <span className="block text-[10px] uppercase font-bold opacity-60">{date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                    <button 
                      onClick={() => setWeekOffset(prev => prev + 1)}
                      className="p-2 rounded-xl border border-neutral-100 bg-white hover:bg-neutral-50 transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="p-4 border-b border-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-400">Hora</th>
                        {BARBERS.map(b => (
                          <th key={b.id} className="p-4 border-b border-neutral-100 text-center text-xs font-bold uppercase tracking-widest text-neutral-400">
                            {b.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {HOURS.map(hour => (
                        <tr key={hour} className="group">
                          <td className="p-4 border-b border-neutral-50 font-mono text-sm text-neutral-500">{hour}</td>
                          {BARBERS.map(barber => {
                            const occupied = isSlotOccupied(selectedDate, hour, barber.id);
                            const isSelected = selectedTime === hour && selectedBarber?.id === barber.id;
                            return (
                              <td key={barber.id} className="p-2 border-b border-neutral-50">
                                <button
                                  disabled={occupied}
                                  onClick={() => {
                                    setSelectedTime(hour);
                                    setSelectedBarber(barber);
                                  }}
                                  className={cn(
                                    "w-full py-3 rounded-xl text-sm font-medium transition-all",
                                    occupied ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" :
                                    isSelected ? "bg-olive text-white shadow-lg shadow-olive/20" :
                                    "bg-neutral-50 text-neutral-600 hover:bg-olive/10 hover:text-olive"
                                  )}
                                >
                                  {occupied ? "Ocupado" : isSelected ? "Elegido" : "Disponible"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button 
                    onClick={nextStep} 
                    disabled={!selectedTime || !selectedBarber}
                    className="px-10 py-4 bg-neutral-900 text-white rounded-2xl font-medium disabled:opacity-50 flex items-center gap-2 group"
                  >
                    Siguiente <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
            </div>
          )}

          {step === 2 && (
            <div
              className="space-y-8"
            >
                <h2 className="text-3xl font-serif">Selecciona el Servicio</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-olive mb-6">Caballero</h3>
                    {SERVICES.filter(s => s.category === "CABALLERO").map(service => (
                      <button
                        key={service.name}
                        onClick={() => setSelectedService(service)}
                        className={cn(
                          "w-full p-6 rounded-2xl border-2 text-left transition-all flex justify-between items-center",
                          selectedService?.name === service.name ? "border-olive bg-olive/5" : "border-neutral-50 bg-neutral-50/50 hover:border-olive/20"
                        )}
                      >
                        <div>
                          <p className="font-medium text-lg">{service.name}</p>
                          <p className="text-xs text-neutral-400">{service.duration} min</p>
                        </div>
                        <span className="text-xl font-serif font-medium">{service.price.toFixed(2)}€</span>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-olive mb-6">Señora</h3>
                    {SERVICES.filter(s => s.category === "SEÑORA").map(service => (
                      <button
                        key={service.name}
                        onClick={() => setSelectedService(service)}
                        className={cn(
                          "w-full p-6 rounded-2xl border-2 text-left transition-all flex justify-between items-center",
                          selectedService?.name === service.name ? "border-olive bg-olive/5" : "border-neutral-50 bg-neutral-50/50 hover:border-olive/20"
                        )}
                      >
                        <div>
                          <p className="font-medium text-lg">{service.name}</p>
                          <p className="text-xs text-neutral-400">{service.duration} min</p>
                        </div>
                        <span className="text-xl font-serif font-medium">{service.price.toFixed(2)}€</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-8">
                  <button onClick={prevStep} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-600">
                    <ChevronLeft className="w-4 h-4" /> Volver
                  </button>
                  <button 
                    onClick={nextStep} 
                    disabled={!selectedService}
                    className="px-10 py-4 bg-neutral-900 text-white rounded-2xl font-medium disabled:opacity-50"
                  >
                    Continuar
                  </button>
            </div>
          )}

          {step === 3 && (
            <div
              className="space-y-8"
            >
                <h2 className="text-3xl font-serif">Tus Datos</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">Nombre</label>
                    <input 
                      type="text" 
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      className="w-full p-5 rounded-2xl bg-neutral-50 border-none outline-none focus:ring-2 focus:ring-olive/20"
                      placeholder="Nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">Apellidos</label>
                    <input 
                      type="text" 
                      value={customerInfo.surname}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, surname: e.target.value })}
                      className="w-full p-5 rounded-2xl bg-neutral-50 border-none outline-none focus:ring-2 focus:ring-olive/20"
                      placeholder="Apellidos"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">Email</label>
                    <input 
                      type="email" 
                      value={customerInfo.email}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                      className="w-full p-5 rounded-2xl bg-neutral-50 border-none outline-none focus:ring-2 focus:ring-olive/20"
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 ml-1">Teléfono</label>
                    <input 
                      type="tel" 
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                      className="w-full p-5 rounded-2xl bg-neutral-50 border-none outline-none focus:ring-2 focus:ring-olive/20"
                      placeholder="600 000 000"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-8">
                  <button onClick={prevStep} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-600">
                    <ChevronLeft className="w-4 h-4" /> Volver
                  </button>
                  <button 
                    onClick={nextStep} 
                    disabled={!customerInfo.name || !customerInfo.surname || !customerInfo.email || !customerInfo.phone}
                    className="px-10 py-4 bg-neutral-900 text-white rounded-2xl font-medium disabled:opacity-50"
                  >
                    Siguiente
                  </button>
            </div>
          )}

          {step === 4 && (
            <div
              className="space-y-8 text-center"
            >
                <div className="w-20 h-20 bg-olive/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-10 h-10 text-olive" />
                </div>
                <h2 className="text-3xl font-serif">¿Añadimos algo más?</h2>
                
                {aiLoading ? (
                  <div className="flex flex-col items-center gap-4 py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-olive" />
                    <p className="text-neutral-400 italic">Consultando con nuestro experto...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="p-8 bg-neutral-50 rounded-[2rem] border border-neutral-100 max-w-2xl mx-auto">
                      <div className="prose prose-neutral text-neutral-600 italic mb-6">
                        <ReactMarkdown>{aiSuggestion?.replace(/SUGERENCIA: .*/, "") || ""}</ReactMarkdown>
                      </div>
                      
                      {aiSuggestion?.match(/SUGERENCIA:\s*(.*)/) && (
                        <button
                          onClick={handleAddSuggestedService}
                          className="px-8 py-4 bg-white border-2 border-olive text-olive rounded-2xl font-medium hover:bg-olive hover:text-white transition-all flex items-center gap-2 mx-auto"
                        >
                          <Plus className="w-5 h-5" /> Añadir Sugerencia
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 justify-center">
                      <button 
                        onClick={() => setStep(5)}
                        className="px-10 py-4 text-neutral-400 hover:text-neutral-600 font-medium"
                      >
                        No, gracias. Solo lo elegido.
                      </button>
                      <button 
                        onClick={() => setStep(2)}
                        className="px-10 py-4 bg-neutral-100 text-neutral-800 rounded-2xl font-medium hover:bg-neutral-200 transition-all"
                      >
                        Ver todos los servicios
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}

          {step === 5 && (
            <div
              className="space-y-8"
            >
                <h2 className="text-3xl font-serif">Resumen Final</h2>
                
                <div className="bg-neutral-900 text-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                    <Scissors className="w-40 h-40" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-olive font-bold mb-2">Cliente</p>
                        <p className="text-2xl font-serif">{customerInfo.name} {customerInfo.surname}</p>
                        <p className="text-neutral-400 text-sm">{customerInfo.phone} · {customerInfo.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-olive font-bold mb-2">Cita</p>
                        <p className="text-2xl font-serif">{selectedDate}</p>
                        <p className="text-neutral-400 text-sm">A las {selectedTime} con {selectedBarber?.name}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-olive font-bold mb-2">Servicios</p>
                      <ul className="space-y-3">
                        <li className="flex justify-between items-center pb-3 border-b border-white/10">
                          <span>{selectedService?.name}</span>
                          <span className="font-serif">{selectedService?.price.toFixed(2)}€</span>
                        </li>
                        {additionalServices.map(s => (
                          <li key={s.name} className="flex justify-between items-center pb-3 border-b border-white/10 text-olive">
                            <span className="flex items-center gap-2"><Plus className="w-3 h-3" /> {s.name}</span>
                            <span className="font-serif">{s.price.toFixed(2)}€</span>
                          </li>
                        ))}
                        <li className="flex justify-between items-center pt-4 text-2xl font-serif">
                          <span>Total</span>
                          <span>{((selectedService?.price || 0) + additionalServices.reduce((acc, s) => acc + s.price, 0)).toFixed(2)}€</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-8">
                  <button onClick={() => setStep(4)} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-600">
                    <ChevronLeft className="w-4 h-4" /> Volver
                  </button>
                  <button 
                    onClick={handleFinalBooking}
                    disabled={bookingLoading}
                    className="px-12 py-5 bg-olive text-white rounded-2xl font-medium disabled:opacity-50 shadow-2xl shadow-olive/30 flex items-center gap-3"
                  >
                    {bookingLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Confirmar y Bloquear Cita
                  </button>
            </div>
          )}
        </div>
      </div>
      
      <p className="mt-8 text-center text-neutral-400 text-xs uppercase tracking-[0.2em]">
        © {new Date().getFullYear()} Peluquería Antonio López e Hijo · Málaga
      </p>
    </div>
  );
}
